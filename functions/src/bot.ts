// /dg command handling. Discord sends each command (and each autocomplete keystroke) here; the reply goes back in the HTTP response.
import { randomInt } from 'node:crypto';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { isSuccess } from '../../src/rules';
import { agentOf, choicesFor, findTest, rollTest, sheetLines, type Agent } from './dg.js';
import { formatRoll, plain } from './discord.js';

interface Option { name: string; type: number; value?: string | number; focused?: boolean; options?: Option[] }
export interface Interaction {
  type: number; // 1 ping, 2 command, 4 autocomplete
  data?: { name: string; options?: Option[] };
  guild_id?: string; channel_id?: string;
  member?: { user: { id: string }; permissions: string };
}

const MANAGE_CHANNELS = 1n << 4n;
const COOLDOWN_MS = 2000;
// shortcut: per-instance memory, so with several instances a user could squeeze in a few extra; move to Firestore if that's ever abused.
const lastCommand = new Map<string, number>();

const db = () => getFirestore();
const reply = (content: string, ephemeral = false) =>
  ({ type: 4, data: { content, flags: ephemeral ? 64 : 0, allowed_mentions: { parse: [] } } });
const choices = (list: { name: string; value: string }[]) => ({ type: 8, data: { choices: list } });

/** discordChannels/{channelId}: { gameId, guildId, linkedBy, linkedAt }. discordClaims/{gameId}_{userId}: { gameId, userId, agentId, claimedAt }. */
const linkRef = (channel: string) => db().doc(`discordChannels/${channel}`);
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
  const list = snap.docs.map((d) => ({ id: d.id, label: String(d.get('codename') || d.get('name') || 'Unnamed agent') }));
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
  return doc.exists ? { id, agent: agentOf(doc.data()!) } : null;
}

export async function handle(i: Interaction, now = Date.now()): Promise<object> {
  if (i.type === 1) return { type: 1 };
  const sub = i.data?.options?.[0];
  const user = i.member?.user.id;
  if (!sub || !user || !i.guild_id || !i.channel_id) return reply('Use /dg in a server channel.', true);
  const opt = (name: string) => sub.options?.find((o) => o.name === name);
  const manage = (BigInt(i.member?.permissions ?? '0') & MANAGE_CHANNELS) !== 0n;
  const gameId = (await linkRef(i.channel_id).get()).get('gameId') as string | undefined;

  if (i.type === 4) {
    const typed = String(sub.options?.find((o) => o.focused)?.value ?? '');
    if (!gameId) return choices([]);
    if (sub.name === 'roll') { const me = await myAgent(gameId, user); return choices(me ? choicesFor(me.agent, typed) : []); }
    const q = typed.trim().toLowerCase();
    return choices((await agentsOf(gameId)).filter((a) => a.label.toLowerCase().includes(q)).slice(0, 25).map((a) => ({ name: a.label.slice(0, 100), value: a.id })));
  }

  if (now - (lastCommand.get(user) ?? 0) < COOLDOWN_MS) return reply('One command every 2 seconds, please.', true);
  if (lastCommand.size >= 1000) for (const [u, t] of lastCommand) if (now - t >= COOLDOWN_MS) lastCommand.delete(u);
  lastCommand.set(user, now);

  if (sub.name === 'link') {
    if (!manage) return reply('Linking a channel needs the Manage Channels permission.', true);
    const id = String(opt('game')?.value ?? '').trim().toLowerCase().replace(/^.*\/g\//, '').replace(/\/.*$/, '');
    if (!/^[a-z0-9-]{1,100}$/.test(id) || !(await db().doc(`games/${id}`).get()).exists) return reply('No game has that ID. Copy it from the game page address: yourcodena.me/g/<game ID>.', true);
    await linkRef(i.channel_id).set({ gameId: id, guildId: i.guild_id, linkedBy: user, linkedAt: now });
    return reply(`This channel now plays game \`${id}\`. Players: \`/dg claim\` your Agent, then \`/dg roll\`.`);
  }
  if (sub.name === 'unlink') {
    if (!manage) return reply('Unlinking needs the Manage Channels permission.', true);
    await linkRef(i.channel_id).delete();
    return reply('This channel is no longer linked to a game.');
  }
  if (!gameId) return reply('This channel isn\'t linked to a game. Someone with Manage Channels can run `/dg link`.', true);

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
    const batch = db().batch();
    batch.create(db().collection(`games/${gameId}/rolls`).doc(), { ...r, agentId: me.id, agentName: me.agent.name, createdAt: now, source: 'discord' });
    if (check) batch.update(db().doc(`games/${gameId}/agents/${me.id}`), { 'live.checked': FieldValue.arrayUnion(t.label), updatedAt: now });
    await batch.commit();
    return reply(formatRoll({ ...r, agentName: me.agent.name }) + (check ? ' · marked for improvement' : ''));
  }
  return reply('Unknown command.', true);
}
