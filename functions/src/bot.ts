// /dg command handling. Discord sends each command (and each autocomplete keystroke) here; the reply goes back in the HTTP response.
import { randomInt } from 'node:crypto';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { isGameId } from '../../src/lib/gameId';
import { agentLabel } from '../../src/model/names';
import { diceText, isSuccess, parseDice } from '../../src/rules';
import { agentOf, applyHit, choicesFor, diceEntry, findTest, isDice, rollAgainst, rollExpression, rollTest, sheetLines, type Agent } from './dg.js';
import { formatEntry, formatRoll, plain, type Roll } from './discord.js';

interface Option { name: string; type: number; value?: string | number; focused?: boolean; options?: Option[] }
export interface Interaction {
  type: number; // 1 ping, 2 command, 4 autocomplete
  data?: { name: string; options?: Option[] };
  guild_id?: string; channel_id?: string;
  member?: { user: { id: string; username?: string; global_name?: string | null }; nick?: string | null; permissions: string };
}

const MANAGE_CHANNELS = 1n << 4n;
const COOLDOWN_MS = 2000;
// shortcut: per-instance memory, so with several instances a user could squeeze in a few extra; move to Firestore if that's ever abused.
const lastCommand = new Map<string, number>();

const db = () => getFirestore();
const reply = (content: string, ephemeral = false) =>
  ({ type: 4, data: { content, flags: ephemeral ? 64 : 0, allowed_mentions: { parse: [] } } });
const choices = (list: { name: string; value: string }[]) => ({ type: 8, data: { choices: list } });

/**
 * discordGuilds/{guildId}: { gameId, linkedBy, linkedAt }, so /dg works in every channel of the server.
 * discordChannels/{channelId}: the older per-channel link, still honoured and checked first. discordClaims/{gameId}_{userId}: { gameId, userId, agentId, claimedAt }. */
const linkRef = (channel: string) => db().doc(`discordChannels/${channel}`);
const guildRef = (guild: string) => db().doc(`discordGuilds/${guild}`);
const gameOf = async (channel: string, guild: string) =>
  ((await linkRef(channel).get()).get('gameId') ?? (await guildRef(guild).get()).get('gameId')) as string | undefined;
const claimRef = (gameId: string, user: string) => db().doc(`discordClaims/${gameId}_${user}`);
const claimsQuery = (gameId: string, agentId: string) =>
  db().collection('discordClaims').where('gameId', '==', gameId).where('agentId', '==', agentId);
const claimsOfAgent = (gameId: string, agentId: string) => claimsQuery(gameId, agentId).get();

// Autocomplete asks on every keystroke; a few seconds of memory spares Firestore the repeat reads.
const AGENTS_TTL_MS = 5000;
const agentCache = new Map<string, { at: number; list: { id: string; label: string }[] }>();
async function agentsOf(gameId: string) {
  const hit = agentCache.get(gameId);
  if (hit && Date.now() - hit.at < AGENTS_TTL_MS) return hit.list;
  const snap = await db().collection(`games/${gameId}/agents`).select('name', 'codename').get();
  const list = snap.docs.map((d) => ({ id: d.id, label: agentLabel(d.get('codename'), d.get('name')) }));
  if (agentCache.size >= 100) agentCache.clear();
  agentCache.set(gameId, { at: Date.now(), list });
  return list;
}
const findAgent = async (gameId: string, value: string) => {
  const q = value.trim().toLowerCase();
  return (await agentsOf(gameId)).find((a) => a.id === value || a.label.toLowerCase() === q) ?? null;
};
async function myAgent(gameId: string, user: string): Promise<{ id: string; agent: Agent } | null> {
  const id = (await claimRef(gameId, user).get()).get('agentId') as string | undefined;
  if (!id) return null;
  const doc = await db().doc(`games/${gameId}/agents/${id}`).get();
  if (doc.exists) return { id, agent: agentOf(doc.data()!) };
  await claimRef(gameId, user).delete(); // the agent was deleted from the game: drop the stale claim
  return null;
}

/** Claimed Agent's id and name from the agent doc's summary fields, so a sheet that won't parse can't block a dice roll. */
async function claimed(gameId: string, user: string): Promise<{ id: string; name: string } | null> {
  const id = (await claimRef(gameId, user).get()).get('agentId') as string | undefined;
  if (!id) return null;
  const doc = await db().doc(`games/${gameId}/agents/${id}`).get();
  return doc.exists ? { id, name: agentLabel(doc.get('codename'), doc.get('name')) } : null;
}
/** Just the claimed Agent's id: `/dg damage` reads the agent doc itself, inside its transaction. */
const claimId = async (gameId: string, user: string) => (await claimRef(gameId, user).get()).get('agentId') as string | undefined;
const face = (sides: number) => randomInt(1, sides + 1);
/** A number typed into `test:` ("45") is a plain d% roll against it. */
const TARGET = /^\d{1,3}$/;
/** Who rolled: the claimed Agent, else the player's server nickname, display name or username. */
export const rollerName = (agent: string | null, m?: Interaction['member']) =>
  agent ?? m?.nick ?? m?.user.global_name ?? m?.user.username ?? 'Someone';

const hasWebhook = async (gameId: string) => Boolean((await db().doc(`gameSecrets/${gameId}`).get()).get('webhookUrl'));
/**
 * With a webhook, a trigger posts the result to its channel and the player gets a private copy where they typed.
 * Without one, the bot answers in the channel.
 */
export const answer = (text: string, viaWebhook: boolean) =>
  (viaWebhook ? reply(`${text}\n-# Posted to the game's dice channel.`, true) : reply(text));

/** Short forms registered in commands.ts: `/dg r t: m:` is `/dg roll test: modifier:`, `/dg d d:` is `/dg damage dice:`. */
const ALIASES: Record<string, { name: string; options: Record<string, string> }> = {
  r: { name: 'roll', options: { t: 'test', m: 'modifier' } },
  d: { name: 'damage', options: { d: 'dice' } },
};
const expand = (o: Option): Option => {
  const a = ALIASES[o.name];
  return a ? { ...o, name: a.name, options: o.options?.map((x) => ({ ...x, name: a.options[x.name] ?? x.name })) } : o;
};

export async function handle(i: Interaction, now = Date.now()): Promise<object> {
  if (i.type === 1) return { type: 1 };
  const raw = i.data?.options?.[0];
  const sub = raw && expand(raw);
  const user = i.member?.user.id;
  if (!sub || !user || !i.guild_id || !i.channel_id) return reply('Use /dg in a server channel.', true);
  const opt = (name: string) => sub.options?.find((o) => o.name === name);
  const manage = (BigInt(i.member?.permissions ?? '0') & MANAGE_CHANNELS) !== 0n;
  const gameId = await gameOf(i.channel_id, i.guild_id);

  if (i.type === 4) {
    const typed = String(sub.options?.find((o) => o.focused)?.value ?? '');
    if (!gameId) return choices([]);
    if (sub.name === 'roll') {
      // Typed dice ("2d6+1") or a number ("45") come first as their own choice; the Agent's tests follow.
      const p = parseDice(typed), n = TARGET.test(typed.trim()) ? Number(typed) : 0;
      const extra = p?.sides ? [{ name: `Roll ${diceText(p)}`, value: diceText(p) }] : n >= 1 && n <= 100 ? [{ name: `Roll d% against ${n}%`, value: String(n) }] : [];
      // A sheet that won't parse just means no tests to suggest; dice still work without one.
      const me = await myAgent(gameId, user).catch(() => null);
      return choices([...extra, ...(me ? choicesFor(me.agent, typed) : [])].slice(0, 25));
    }
    const q = typed.trim().toLowerCase();
    return choices((await agentsOf(gameId)).filter((a) => a.label.toLowerCase().includes(q)).slice(0, 25).map((a) => ({ name: a.label.slice(0, 100), value: a.id })));
  }

  if (now - (lastCommand.get(user) ?? 0) < COOLDOWN_MS) return reply('One command every 2 seconds, please.', true);
  if (lastCommand.size >= 1000) for (const [u, t] of lastCommand) if (now - t >= COOLDOWN_MS) lastCommand.delete(u);
  lastCommand.set(user, now);

  if (sub.name === 'link') {
    if (!manage) return reply('Linking needs the Manage Channels permission.', true);
    const id = String(opt('game')?.value ?? '').trim().toLowerCase().replace(/^.*\/g\//, '').replace(/\/.*$/, '');
    if (!isGameId(id) || !(await db().doc(`games/${id}`).get()).exists) return reply('No game has that ID. Copy it from the game page address: yourcodena.me/g/<game ID>.', true);
    await guildRef(i.guild_id).set({ gameId: id, linkedBy: user, linkedAt: now });
    await linkRef(i.channel_id).delete(); // a stale per-channel link here would otherwise win
    return reply(`This server now plays game \`${id}\`. Players: \`/dg claim\` your Agent, then \`/dg roll\` in any channel.`);
  }
  if (sub.name === 'unlink') {
    if (!manage) return reply('Unlinking needs the Manage Channels permission.', true);
    await Promise.all([guildRef(i.guild_id).delete(), linkRef(i.channel_id).delete()]);
    return reply('This server is no longer linked to a game.');
  }
  if (!gameId) return reply('This server isn\'t linked to a game. Someone with Manage Channels can run `/dg link`.', true);

  if (sub.name === 'claim') {
    const a = await findAgent(gameId, String(opt('agent')?.value ?? ''));
    if (!a) return reply('No Agent by that name in this game.', true);
    // A transaction, so two players claiming the same Agent at once can't both win.
    const holder = await db().runTransaction(async (tx) => {
      const others = (await tx.get(claimsQuery(gameId, a.id))).docs.filter((d) => d.get('userId') !== user);
      if (others.length && !manage) return String(others[0].get('userId'));
      others.forEach((d) => tx.delete(d.ref));
      tx.set(claimRef(gameId, user), { gameId, userId: user, agentId: a.id, claimedAt: now });
      return null;
    });
    if (holder) return reply(`**${plain(a.label)}** is played by <@${holder}>. They can \`/dg unclaim\`, or someone with Manage Channels can take it over.`, true);
    return reply(`<@${user}> now plays **${plain(a.label)}**.`);
  }
  if (sub.name === 'unclaim') {
    const value = opt('agent')?.value;
    if (value === undefined) { await claimRef(gameId, user).delete(); return reply(`<@${user}> no longer plays an Agent here.`); }
    const a = await findAgent(gameId, String(value));
    if (!a) return reply('No Agent by that name in this game.', true);
    const claims = (await claimsOfAgent(gameId, a.id)).docs;
    if (claims.some((d) => d.get('userId') !== user) && !manage) return reply('Releasing someone else\'s Agent needs the Manage Channels permission.', true);
    await Promise.all(claims.map((d) => d.ref.delete()));
    return reply(`**${plain(a.label)}** is free to claim.`);
  }

  // Every roll is logged, so it shows in the game page's roll log; rollToDiscord posts it unless the bot already answered.
  const logEntry = (e: Roll, agentId: string, viaWebhook: boolean) =>
    ({ ...e, agentId, createdAt: now, source: 'discord', ...(viaWebhook ? {} : { answered: true }) });

  // `/dg roll test:2D6+1` (plain dice for anything rolled outward: damage dealt, a random table) and `/dg roll test:45`
  // (d% against a number). No claim needed, so the Handler can roll too.
  const typed = String(opt('test')?.value ?? '').trim();
  if (sub.name === 'roll' && (isDice(typed) || TARGET.test(typed))) {
    const target = Number(typed);
    if (!isDice(typed) && (target < 1 || target > 100)) return reply('A d% roll needs a number from 1 to 100.', true);
    const [mine, viaWebhook] = await Promise.all([claimed(gameId, user), hasWebhook(gameId)]);
    const name = rollerName(mine?.name ?? null, i.member);
    const e: Roll = isDice(typed)
      ? diceEntry(rollExpression(typed, face)!, name)
      : { ...rollAgainst(target, randomInt(1, 101), Number(opt('modifier')?.value ?? 0)), agentName: name };
    await db().collection(`games/${gameId}/rolls`).add(logEntry(e, mine?.id ?? '', viaWebhook));
    return answer(formatEntry(e), viaWebhook);
  }

  // `/dg damage dice:1D10`: your Agent gets hurt. The HP comes off their sheet on the site (HP never below 0, p. 55),
  // and an open sheet merges it in (pages/Agent.tsx).
  if (sub.name === 'damage') {
    const hit = rollExpression(String(opt('dice')?.value ?? ''), face);
    if (!hit) return reply('Use dice like `1D10` or `2D6+1`, or a number like `7`.', true);
    const [agentId, viaWebhook] = await Promise.all([claimId(gameId, user), hasWebhook(gameId)]);
    if (!agentId) return reply('Claim your Agent first (`/dg claim`), so the damage comes off the right sheet.', true);
    const ref = db().doc(`games/${gameId}/agents/${agentId}`);
    // A transaction, so two hits landing at once both come off.
    const e = await db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return null;
      const { update, entry } = applyHit(snap.data()!, hit, agentLabel(snap.get('codename'), snap.get('name')), now);
      tx.update(ref, update);
      tx.create(db().collection(`games/${gameId}/rolls`).doc(), logEntry(entry, agentId, viaWebhook));
      return entry;
    });
    if (!e) return reply('Your claimed Agent is no longer in this game. Use `/dg claim` again.', true);
    return answer(formatEntry(e), viaWebhook);
  }

  const me = await myAgent(gameId, user);
  if (!me) return reply('You haven\'t claimed an Agent in this game. Use `/dg claim` first.', true);

  if (sub.name === 'sheet') {
    const [name, ...rest] = sheetLines(me.agent);
    return reply([`**${plain(name)}**`, ...rest.map((l) => plain(l, 1900))].join('\n'), true);
  }
  if (sub.name === 'roll') {
    const t = findTest(me.agent, String(opt('test')?.value ?? ''));
    if (!t) return reply('No stat, skill or test by that name. Pick one from the list.', true);
    const r = rollTest(me.agent, t, randomInt(1, 101), Number(opt('modifier')?.value ?? 0));
    // Same as the live sheet: a failed skill earns a check toward end-of-session advancement (p. 28).
    const check = t.skill && !isSuccess(r.outcome) && me.agent.hasLive && !me.agent.l.checked.includes(t.label);
    // rollToDiscord posts it when there's a webhook; otherwise `answered` tells it the bot already replied in the channel.
    const viaWebhook = await hasWebhook(gameId);
    const batch = db().batch();
    batch.create(db().collection(`games/${gameId}/rolls`).doc(), logEntry({ ...r, agentName: me.agent.name }, me.id, viaWebhook));
    if (check) batch.update(db().doc(`games/${gameId}/agents/${me.id}`), { 'live.checked': FieldValue.arrayUnion(t.label), updatedAt: now });
    await batch.commit();
    const text = formatRoll({ ...r, agentName: me.agent.name }) + (check ? ' · marked for improvement' : '');
    return answer(text, viaWebhook);
  }
  return reply('Unknown command.', true);
}
