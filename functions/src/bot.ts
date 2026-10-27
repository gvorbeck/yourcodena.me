// /dg command handling. Discord sends each command (and each autocomplete keystroke) here; the reply goes back in the HTTP response.
import { randomInt } from 'node:crypto';
import { FieldPath, FieldValue, getFirestore, type DocumentData, type DocumentReference } from 'firebase-admin/firestore';
import { REMOVED, type Change } from '../../src/lib/diff';
import { SAN_KINDS, type SanKind } from '../../src/model/live';
import { isGameId } from '../../src/lib/gameId';
import { agentLabel } from '../../src/model/names';
import { diceText, isSuccess, parseDice } from '../../src/rules';
import { agentOf, applyHit, bondsOf, canProject, choicesFor, diceEntry, findTest, finishSan, isDice, planSan, rollAgainst, rollExpression, rollTest, sheetLines, type Agent, type Loss, type SanStake } from './dg.js';
import { formatEntry, formatRoll, plain, type Roll } from './discord.js';
import { ALIASES } from './commands.js';
import { agentPath, agentsPath, gamePath, rollsPath } from '../../src/lib/paths';

interface Option { name: string; type: number; value?: string | number; focused?: boolean; options?: Option[] }
export interface Interaction {
  type: number; // 1 ping, 2 command, 3 button, 4 autocomplete
  data?: { name?: string; options?: Option[]; custom_id?: string };
  guild_id?: string; channel_id?: string;
  member?: { user: { id: string; username?: string; global_name?: string | null }; nick?: string | null; permissions: string };
}

const MANAGE_CHANNELS = 1n << 4n;
const COOLDOWN_MS = 2000;
// shortcut: per-instance memory, so with several instances a user could squeeze in a few extra; move to Firestore if that's ever abused.
const lastCommand = new Map<string, number>();

const db = () => getFirestore();
const NO_PINGS = { allowed_mentions: { parse: [] } };
/** A message in answer to a command; `ephemeral` only the player sees. */
export const reply = (content: string, ephemeral = false) => ({ type: 4, data: { content, flags: ephemeral ? 64 : 0, ...NO_PINGS } });
const choices = (list: { name: string; value: string }[]) => ({ type: 8, data: { choices: list } });
/** A private message with its own content and buttons. */
const privately = (data: { content: string; components?: unknown[] }) => ({ type: 4, data: { ...data, flags: 64, ...NO_PINGS } });
/** Replace the message whose button was pressed (no buttons unless given). */
const updateTo = (content: string, components: unknown[] = []) => ({ type: 7, data: { content, components, ...NO_PINGS } });
const SETTLED = 'This SAN loss is already settled.';
const gone = () => reply('Your claimed Agent is no longer in this game. Use `/dg claim` again.', true);
const canManage = (m: Interaction['member']) => (BigInt(m?.permissions ?? '0') & MANAGE_CHANNELS) !== 0n;

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
  const snap = await db().collection(agentsPath(gameId)).select('name', 'codename').get();
  const list = snap.docs.map((d) => ({ id: d.id, label: labelOf(d) }));
  if (agentCache.size >= 100) agentCache.clear();
  agentCache.set(gameId, { at: Date.now(), list });
  return list;
}
const findAgent = async (gameId: string, value: string) => {
  const q = value.trim().toLowerCase();
  return (await agentsOf(gameId)).find((a) => a.id === value || a.label.toLowerCase() === q) ?? null;
};
/** An agent doc's list name, from its summary fields, so a sheet that won't parse still has one. */
const labelOf = (d: { get: (f: string) => unknown }) => agentLabel(d.get('codename'), d.get('name'));
const agentRef = (gameId: string, agentId: string) => db().doc(agentPath(gameId, agentId));
/** Just the claimed Agent's id: `/dg damage` reads the agent doc itself, inside its transaction. */
const claimId = async (gameId: string, user: string) => (await claimRef(gameId, user).get()).get('agentId') as string | undefined;
/** The claimed Agent's doc; `doc` is null with no claim, and `doc.exists` is false when that Agent was deleted from the game. */
async function claimedDoc(gameId: string, user: string) {
  const id = await claimId(gameId, user);
  return id ? agentRef(gameId, id).get() : null;
}
async function myAgent(gameId: string, user: string): Promise<{ id: string; agent: Agent } | null> {
  const doc = await claimedDoc(gameId, user);
  if (!doc) return null;
  if (doc.exists) return { id: doc.id, agent: agentOf(doc.data()!) };
  await claimRef(gameId, user).delete(); // the agent was deleted from the game: drop the stale claim
  return null;
}
/** Claimed Agent's id and name, so a sheet that won't parse can't block a dice roll. */
async function claimed(gameId: string, user: string): Promise<{ id: string; name: string } | null> {
  const doc = await claimedDoc(gameId, user);
  return doc?.exists ? { id: doc.id, name: labelOf(doc) } : null;
}
const face = (sides: number) => randomInt(1, sides + 1);
/** Math.random-shaped, from the crypto generator, for the shared rules code (SAN loss). */
const rng = () => randomInt(0, 2 ** 47) / 2 ** 47;
/** Agent-doc leaves as Firestore update arguments: field path, value, field path, value… */
export const toPairs = (leaves: Change[]) => leaves.flatMap(([path, v]) => [new FieldPath(...path), v === REMOVED ? FieldValue.delete() : v]);
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

/** A roll-log entry as written; `answered` tells rollToDiscord the bot already posted it in the channel. */
const logged = (e: Roll, agentId: string, viaWebhook: boolean, now: number) =>
  ({ ...e, agentId, createdAt: now, source: 'discord', ...(viaWebhook ? {} : { answered: true }) });
const rollsOf = (gameId: string) => db().collection(rollsPath(gameId));

/**
 * The one transaction for `/dg damage` and `/dg san`: apply `rule` to the stored agent doc, write only the leaves it
 * changed (an open sheet merges them in, pages/Agent.tsx), and log the entry, so two losses landing at once both count.
 * `settles` is a held SAN loss to clear in the same transaction; if it's already gone (a double click), nothing happens.
 * Null when the Agent is no longer in the game.
 */
async function commitLoss(gameId: string, agentId: string, viaWebhook: boolean, now: number,
  rule: (d: DocumentData, agentName: string) => Loss | { error: string }, settles?: DocumentReference): Promise<Loss | { error: string } | null> {
  const ref = agentRef(gameId, agentId);
  return db().runTransaction(async (tx) => {
    const [snap, held] = await Promise.all([tx.get(ref), settles && tx.get(settles)]);
    if (settles && !held?.exists) return { error: SETTLED };
    if (!snap.exists) return null;
    const r = rule(snap.data()!, labelOf(snap));
    if ('error' in r) return r;
    const [field, value, ...rest] = [...toPairs(r.leaves), 'updatedAt', now];
    tx.update(ref, field as FieldPath, value, ...rest);
    tx.create(rollsOf(gameId).doc(), logged(r.entry, agentId, viaWebhook, now));
    if (settles) tx.delete(settles);
    return r;
  });
}

// ---- /dg san with projection (p. 74). A failed SAN loss that projecting could reduce is held in discordPending/{agentId}
// while the player decides, in a private message with buttons: project or take it, then (after the 1D4 WP roll) which
// Bond. Only then is it applied and posted for everyone. The SAN test itself is logged and posted straight away, so it's
// on record and can't be re-rolled; `/dg san` while one is held shows the same choice again.
interface HeldSan extends SanStake { gameId: string; agentId: string; userId: string; testLine: string; createdAt: number; n?: number }
const heldRef = (agentId: string) => db().doc(`discordPending/${agentId}`);
type Button = { type: 2; style: 1 | 2; label: string; custom_id: string };
const rows = (buttons: Button[]) => Array.from({ length: Math.ceil(buttons.length / 5) }, (_, r) => ({ type: 1, components: buttons.slice(r * 5, r * 5 + 5) })).slice(0, 5);

/** The private choice for a held loss: project or take it, or (once the 1D4 is rolled) which Bond. */
export function sanChoice(h: HeldSan, a: Agent, name: string) {
  const after = Math.max(0, a.l.san - h.amount);
  if (h.n === undefined) return {
    content: `${h.testLine ? `${h.testLine}\n` : ''}**${plain(name)}** is about to lose **${h.amount} SAN** (${h.kind}) · SAN ${a.l.san} → ${after}.\n`
      + `Project it onto a Bond? You spend 1D4 WP (you have ${a.l.wp}). If you keep at least 1 WP, the loss and one Bond both drop by that much (p. 74).`,
    components: rows([
      { type: 2, style: 1, label: 'Project onto a Bond (1D4 WP)', custom_id: `san:project:${h.agentId}` },
      { type: 2, style: 2, label: 'Take the loss', custom_id: `san:take:${h.agentId}` },
    ]),
  };
  const n = h.n, bonds = bondsOf(a), fit = bonds.filter((b) => b.score >= n), pick = fit.length ? fit : bonds;
  return {
    content: `Rolled **${n}**: spend ${n} WP (${a.l.wp} → ${a.l.wp - n}) and lose ${n} less SAN (${h.amount} → ${Math.max(0, h.amount - n)}). Which Bond takes ${n}?`
      + (fit.length ? '' : '\nNo Bond has that many points: the one you pick drops to 0.'),
    components: rows(pick.map((b) => ({ type: 2, style: 1, label: `${b.name} (${b.score} → ${Math.max(0, b.score - n)})`.slice(0, 80), custom_id: `san:bond:${h.agentId}:${b.i}` }))),
  };
}

/** The settled loss: privately where the buttons were (with a webhook, which posts it) or publicly as a new message. */
function sanSettled(out: Loss | { error: string } | null, testLine: string, viaWebhook: boolean, fromButton: boolean) {
  if (!out) return gone();
  if ('error' in out) return fromButton ? updateTo(out.error) : reply(out.error, true);
  const text = formatEntry(out.entry);
  if (!viaWebhook) return reply(testLine ? `${testLine}\n${text}` : text); // nothing else will post the SAN test
  return fromButton ? updateTo(`${text}\n-# Posted to the game's dice channel.`) : answer(text, true);
}

/**
 * Who may settle a held loss: the player who rolled it, whoever claims that Agent now (the old player may have left),
 * or anyone with Manage Channels (the Handler), so a held loss can never get stuck.
 */
export const maySettle = (h: { userId: string }, presser: string, claimsAgent: boolean, manage: boolean) => h.userId === presser || claimsAgent || manage;

/** A press on one of sanChoice's buttons. */
async function sanButton(i: Interaction, now: number): Promise<object> {
  const [, action, agentId, bond] = String(i.data?.custom_id ?? '').split(':');
  const presser = i.member?.user.id ?? '';
  const ref = heldRef(agentId ?? ''), held = agentId ? await ref.get() : null;
  if (!held?.exists) return updateTo(SETTLED);
  const h = held.data() as HeldSan;
  const manage = canManage(i.member);
  const [viaWebhook, claim, doc] = await Promise.all([
    hasWebhook(h.gameId), claimId(h.gameId, presser), agentRef(h.gameId, agentId).get(),
  ]);
  if (!maySettle(h, presser, claim === agentId, manage)) return reply('Only the player of this Agent (or someone with Manage Channels) can decide this SAN loss.', true);
  if (!doc.exists) { await ref.delete(); return updateTo('That Agent is no longer in the game.'); }
  const settle = async (projection: { bond: number; n: number } | null) => sanSettled(
    await commitLoss(h.gameId, agentId, viaWebhook, now, (d, name) => finishSan(agentOf(d), h, projection, name, rng), ref), h.testLine, viaWebhook, true);
  if (action === 'take') return settle(null);
  const a = agentOf(doc.data()!), name = labelOf(doc);
  if (action === 'project') {
    // Rolled once, inside a transaction: a double click gets the same roll back, never a second one.
    const n = await db().runTransaction(async (tx) => {
      const s = await tx.get(ref);
      if (!s.exists) return null;
      if (typeof s.get('n') === 'number') return s.get('n') as number;
      const rolled = face(4);
      tx.update(ref, { n: rolled });
      return rolled;
    });
    if (n === null) return updateTo(SETTLED);
    if (a.l.wp - n < 1) return settle({ bond: bondsOf(a)[0]?.i ?? 0, n }); // WP runs out: it's spent and the loss stands
    const c = sanChoice({ ...h, n }, a, name);
    return updateTo(c.content, c.components);
  }
  if (action === 'bond' && h.n !== undefined) return settle({ bond: Number(bond), n: h.n });
  return updateTo('That choice has expired. Run `/dg san` again to see it.');
}

/** The short forms registered in commands.ts, as their full command. */
const expand = (o: Option): Option => {
  const a = ALIASES[o.name];
  return a ? { ...o, name: a.name, options: o.options?.map((x) => ({ ...x, name: a.options[x.name] ?? x.name })) } : o;
};

export async function handle(i: Interaction, now = Date.now()): Promise<object> {
  if (i.type === 1) return { type: 1 };
  if (i.type === 3) return sanButton(i, now);
  const raw = i.data?.options?.[0];
  const sub = raw && expand(raw);
  const user = i.member?.user.id;
  if (!sub || !user || !i.guild_id || !i.channel_id) return reply('Use /dg in a server channel.', true);
  const opt = (name: string) => sub.options?.find((o) => o.name === name);
  const manage = canManage(i.member);
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
    if (!isGameId(id) || !(await db().doc(gamePath(id)).get()).exists) return reply('No game has that ID. Copy it from the game page address: yourcodena.me/g/<game ID>.', true);
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

  const logEntry = (e: Roll, agentId: string, viaWebhook: boolean) => logged(e, agentId, viaWebhook, now);

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
    await rollsOf(gameId).add(logEntry(e, mine?.id ?? '', viaWebhook));
    return answer(formatEntry(e), viaWebhook);
  }

  const claimFirst = () => reply('Claim your Agent first (`/dg claim`), so it comes off the right sheet.', true);

  // `/dg damage dice:1D10`: your Agent gets hurt (HP never below 0, p. 55).
  if (sub.name === 'damage') {
    const hit = rollExpression(String(opt('dice')?.value ?? ''), face);
    if (!hit) return reply('Use dice like `1D10` or `2D6+1`, or a number like `7`.', true);
    const [agentId, viaWebhook] = await Promise.all([claimId(gameId, user), hasWebhook(gameId)]);
    if (!agentId) return claimFirst();
    const out = await commitLoss(gameId, agentId, viaWebhook, now, (d, name) => applyHit(d, hit, name));
    if (!out) return gone();
    return 'error' in out ? reply(out.error, true) : answer(formatEntry(out.entry), viaWebhook);
  }

  // `/dg san loss:0/1D6 kind:violence`: SAN test and loss with the live sheet's rules (pp. 66–74), holding the loss for
  // a private projection choice when projecting could reduce it (see sanChoice).
  if (sub.name === 'san') {
    const kind = String(opt('kind')?.value ?? '') as SanKind;
    if (!SAN_KINDS.includes(kind)) return reply('Pick violence, helplessness or unnatural.', true);
    const [agentId, viaWebhook] = await Promise.all([claimId(gameId, user), hasWebhook(gameId)]);
    if (!agentId) return claimFirst();
    const [doc, held] = await Promise.all([agentRef(gameId, agentId).get(), heldRef(agentId).get()]);
    if (!doc.exists) return gone();
    const a = agentOf(doc.data()!), name = labelOf(doc);
    if (held.exists) {
      // One loss at a time: settle the waiting one first. Say so, so the new loss isn't mistaken for handled.
      const c = sanChoice(held.data() as HeldSan, a, name);
      return privately({ ...c, content: `A SAN loss is already waiting for **${plain(name)}**. Settle it first; your new loss (\`${plain(String(opt('loss')?.value ?? ''), 20)}\`) wasn't rolled.\n\n${c.content}` });
    }
    const plan = planSan(a, String(opt('loss')?.value ?? ''), kind, rng);
    if ('error' in plan) return reply(plan.error, true);
    let testLine = '';
    if (plan.test) {
      const t: Roll = { ...plan.test, agentName: name };
      await rollsOf(gameId).add(logged(t, agentId, viaWebhook, now));
      testLine = formatEntry(t);
    }
    if (!canProject(a, plan.stake.amount)) {
      return sanSettled(await commitLoss(gameId, agentId, viaWebhook, now, (d, n) => finishSan(agentOf(d), plan.stake, null, n, rng)), testLine, viaWebhook, false);
    }
    const h: HeldSan = { ...plan.stake, gameId, agentId, userId: user, testLine, createdAt: now };
    await heldRef(agentId).set(h);
    return privately(sanChoice(h, a, name));
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
    batch.create(rollsOf(gameId).doc(), logEntry({ ...r, agentName: me.agent.name }, me.id, viaWebhook));
    if (check) batch.update(agentRef(gameId, me.id), { 'live.checked': FieldValue.arrayUnion(t.label), updatedAt: now });
    await batch.commit();
    const text = formatRoll({ ...r, agentName: me.agent.name }) + (check ? ' · marked for improvement' : '');
    return answer(text, viaWebhook);
  }
  return reply('Unknown command.', true);
}
