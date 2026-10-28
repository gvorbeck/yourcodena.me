// /dg command handling. Discord sends each command (and each autocomplete keystroke) here; the reply goes back in the HTTP response.
import { randomInt } from 'node:crypto';
import { FieldPath, FieldValue, getFirestore, type DocumentData, type DocumentReference } from 'firebase-admin/firestore';
import { REMOVED, type Change } from '../../src/lib/diff';
import { SAN_KINDS, type SanKind } from '../../src/model/live';
import { isGameId } from '../../src/lib/gameId';
import { agentLabel } from '../../src/model/names';
import { canImprove, diceText, isSuccess, matches, parseDice, sameText } from '../../src/rules';
import { agentOf, applyHit, bondsOf, canProject, choicesFor, diceEntry, findTest, finishSan, isDice, planSan, rollAgainst, rollExpression, rollTest, sheetLines, type Agent, type Loss, type SanStake } from './dg.js';
import { bold, formatEntry, formatRoll, plain, type Roll } from './discord.js';
import { ALIASES } from './commands.js';
import { agentPath, agentsPath, gamePath, rollsPath, secretPath } from '../../src/lib/paths';

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
const message = (content: string, flags: number, components?: unknown[]) => ({ type: 4, data: { content, flags, ...(components && { components }), ...NO_PINGS } });
/** A message in answer to a command, for everyone in the channel. */
const reply = (content: string) => message(content, 0);
/** A message only the player sees, optionally with buttons. */
export const privately = (content: string, components?: unknown[]) => message(content, 64, components);
const choices = (list: { name: string; value: string }[]) => ({ type: 8, data: { choices: list } });
/** Replace the message whose button was pressed (no buttons unless given). */
const updateTo = (content: string, components: unknown[] = []) => ({ type: 7, data: { content, components, ...NO_PINGS } });
const SETTLED = 'This SAN loss is already settled.';
const NO_SUCH_AGENT = 'No Agent by that name in this game.';
const POSTED = "\n-# Posted to the game's dice channel.";
const gone = () => privately('Your claimed Agent is no longer in this game. Use `/dg claim` again.');
const canManage = (m: Interaction['member']) => (BigInt(m?.permissions ?? '0') & MANAGE_CHANNELS) !== 0n;

/**
 * discordGuilds/{guildId}: { gameId, linkedBy, linkedAt }, so /dg works in every channel of the server.
 * discordClaims/{gameId}_{userId}: { gameId, userId, agentId, claimedAt }. */
const caches = new Set<() => void>();
/**
 * `load` with its answers remembered per key for `ms`, for reads repeated on every autocomplete keystroke and command.
 * A failed load isn't remembered. Per instance: only cache what may be a moment stale (see each use).
 */
export function cached<T>(load: (key: string) => Promise<T>, ms = 5000) {
  const memo = new Map<string, { at: number; v: Promise<T> }>();
  const get = (key: string) => {
    const hit = memo.get(key);
    if (hit && Date.now() - hit.at < ms) return hit.v;
    if (memo.size >= 100) memo.clear();
    const v = load(key);
    memo.set(key, { at: Date.now(), v });
    v.catch(() => { if (memo.get(key)?.v === v) memo.delete(key); }); // a newer load may have replaced it
    return v;
  };
  const clear = () => memo.clear();
  caches.add(clear);
  return Object.assign(get, { clear });
}
/** Forget everything every cache remembers (tests start from a clean slate). */
export const clearCaches = () => caches.forEach((c) => c());

const guildRef = (guild: string) => db().doc(`discordGuilds/${guild}`);
// shortcut: after /dg link or unlink, other instances can use the old game for up to 2 s; add a version to the guild doc if that ever bites.
const linkedGame = cached(async (guild) => (await guildRef(guild).get()).get('gameId') as string | undefined, 2000);
const claimRef = (gameId: string, user: string) => db().doc(`discordClaims/${gameId}_${user}`);
const claimsQuery = (gameId: string, agentId: string) =>
  db().collection('discordClaims').where('gameId', '==', gameId).where('agentId', '==', agentId);

const agentsOf = cached(async (gameId) =>
  (await db().collection(agentsPath(gameId)).select('name', 'codename').get()).docs.map((d) => ({ id: d.id, label: labelOf(d) })));
const findAgent = async (gameId: string, value: string) =>
  (await agentsOf(gameId)).find((a) => a.id === value || sameText(a.label, value)) ?? null;
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
/** The claimed Agent for autocomplete only (key "gameId user"): a moment-old sheet is fine for suggesting tests; commands read it fresh. */
const suggestAgent = cached((key) => { const [g, u] = key.split(' '); return myAgent(g, u); });
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

// Read fresh every time: the game page and toDiceChannel change it, and a stale "yes" would post a roll nowhere.
const hasWebhook = async (gameId: string) => Boolean((await db().doc(secretPath(gameId)).get()).get('webhookUrl'));
/**
 * With a webhook, a trigger posts the result to its channel and the player gets a private copy where they typed.
 * Without one, the bot answers in the channel.
 */
export const answer = (text: string, viaWebhook: boolean) =>
  (viaWebhook ? privately(text + POSTED) : reply(text));

/** A roll-log entry as written; `answered` tells rollToDiscord the bot already posted it in the channel. */
const logged = (e: Roll, agentId: string, viaWebhook: boolean, now: number) =>
  ({ ...e, agentId, createdAt: now, source: 'discord', ...(viaWebhook ? {} : { answered: true }) });
const rollsOf = (gameId: string) => db().collection(rollsPath(gameId));

/**
 * The one transaction for `/dg damage` and `/dg san`: apply `rule` to the stored agent doc, write only the leaves it
 * changed (an open sheet merges them in, pages/Agent.tsx), and log the entry, so two losses landing at once both count.
 * `settles` is a held SAN loss to clear in the same transaction; if it's already gone (a double click), nothing happens.
 * `test` is the SAN test that decided the loss, logged with it so one is never on record without the other.
 * Null when the Agent is no longer in the game.
 */
async function commitLoss(gameId: string, agentId: string, viaWebhook: boolean, now: number,
  rule: (d: DocumentData, agentName: string) => Loss | { error: string }, settles?: DocumentReference, test?: Roll): Promise<Loss | { error: string } | null> {
  const ref = agentRef(gameId, agentId);
  return db().runTransaction(async (tx) => {
    const [snap, held] = await Promise.all([tx.get(ref), settles && tx.get(settles)]);
    if (settles && !held?.exists) return { error: SETTLED };
    if (!snap.exists) return null;
    const r = rule(snap.data()!, labelOf(snap));
    if ('error' in r) return r;
    const [field, value, ...rest] = [...toPairs(r.leaves), 'updatedAt', now];
    tx.update(ref, field as FieldPath, value, ...rest);
    // Triggers run in no fixed order, so the test rides along with its loss for the webhook post (rollToDiscord).
    if (test) tx.create(rollsOf(gameId).doc(), logged(test, agentId, false, now));
    tx.create(rollsOf(gameId).doc(), { ...logged(r.entry, agentId, viaWebhook, now), ...(test && viaWebhook ? { testLine: formatEntry(test) } : {}) });
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
    content: `${h.testLine ? `${h.testLine}\n` : ''}${bold(name)} is about to lose **${h.amount} SAN** (${h.kind}) · SAN ${a.l.san} → ${after}.\n`
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
  if ('error' in out) return fromButton ? updateTo(out.error) : privately(out.error);
  const text = formatEntry(out.entry);
  if (!viaWebhook) return reply(testLine ? `${testLine}\n${text}` : text); // nothing else will post the SAN test
  return fromButton ? updateTo(text + POSTED) : answer(text, true);
}

/**
 * Who may settle a held loss: the player who rolled it, whoever claims that Agent now (the old player may have left),
 * or anyone with Manage Channels (the Handler), so a held loss can never get stuck.
 */
const maySettle = (h: { userId: string }, presser: string, claimsAgent: boolean, manage: boolean) => h.userId === presser || claimsAgent || manage;

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
  if (!maySettle(h, presser, claim === agentId, manage)) return privately('Only the player of this Agent (or someone with Manage Channels) can decide this SAN loss.');
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
  if (!sub || !user || !i.guild_id || !i.channel_id) return privately('Use /dg in a server channel.');
  const opt = (name: string) => sub.options?.find((o) => o.name === name);
  const str = (name: string) => String(opt(name)?.value ?? '');
  const num = (name: string) => Number(opt(name)?.value ?? 0);
  const manage = canManage(i.member);
  const gameId = await linkedGame(i.guild_id);

  if (i.type === 4) {
    const typed = String(sub.options?.find((o) => o.focused)?.value ?? '');
    if (!gameId) return choices([]);
    if (sub.name === 'roll') {
      // Typed dice ("2d6+1") or a number ("45") come first as their own choice; the Agent's tests follow.
      const p = parseDice(typed), n = TARGET.test(typed.trim()) ? Number(typed) : 0;
      const extra = p?.sides ? [{ name: `Roll ${diceText(p)}`, value: diceText(p) }] : n >= 1 && n <= 100 ? [{ name: `Roll d% against ${n}%`, value: String(n) }] : [];
      // A sheet that won't parse just means no tests to suggest; dice still work without one.
      const me = await suggestAgent(`${gameId} ${user}`).catch(() => null);
      return choices([...extra, ...(me ? choicesFor(me.agent, typed) : [])].slice(0, 25));
    }
    return choices((await agentsOf(gameId)).filter((a) => matches(a.label, typed)).slice(0, 25).map((a) => ({ name: a.label.slice(0, 100), value: a.id })));
  }

  if (now - (lastCommand.get(user) ?? 0) < COOLDOWN_MS) return privately('One command every 2 seconds, please.');
  if (lastCommand.size >= 1000) for (const [u, t] of lastCommand) if (now - t >= COOLDOWN_MS) lastCommand.delete(u);
  lastCommand.set(user, now);

  if (sub.name === 'link') {
    if (!manage) return privately('Linking needs the Manage Channels permission.');
    const id = str('game').trim().toLowerCase().replace(/^.*\/g\//, '').replace(/\/.*$/, '');
    if (!isGameId(id) || !(await db().doc(gamePath(id)).get()).exists) return privately('No game has that ID. Copy it from the game page address: yourcodena.me/g/<game ID>.');
    await guildRef(i.guild_id).set({ gameId: id, linkedBy: user, linkedAt: now });
    linkedGame.clear();
    return reply(`This server now plays game \`${id}\`. Players: \`/dg claim\` your Agent, then \`/dg roll\` in any channel.`);
  }
  if (sub.name === 'unlink') {
    if (!manage) return privately('Unlinking needs the Manage Channels permission.');
    await guildRef(i.guild_id).delete();
    linkedGame.clear();
    return reply('This server is no longer linked to a game.');
  }
  if (!gameId) return privately('This server isn\'t linked to a game. Someone with Manage Channels can run `/dg link`.');

  if (sub.name === 'claim') {
    const a = await findAgent(gameId, str('agent'));
    if (!a) return privately(NO_SUCH_AGENT);
    // A transaction, so two players claiming the same Agent at once can't both win.
    const holder = await db().runTransaction(async (tx) => {
      const others = (await tx.get(claimsQuery(gameId, a.id))).docs.filter((d) => d.get('userId') !== user);
      if (others.length && !manage) return String(others[0].get('userId'));
      others.forEach((d) => tx.delete(d.ref));
      tx.set(claimRef(gameId, user), { gameId, userId: user, agentId: a.id, claimedAt: now });
      return null;
    });
    if (holder) return privately(`${bold(a.label)} is played by <@${holder}>. They can \`/dg unclaim\`, or someone with Manage Channels can take it over.`);
    return reply(`<@${user}> now plays ${bold(a.label)}.`);
  }
  if (sub.name === 'unclaim') {
    const value = opt('agent')?.value;
    if (value === undefined) { await claimRef(gameId, user).delete(); return reply(`<@${user}> no longer plays an Agent here.`); }
    const a = await findAgent(gameId, String(value));
    if (!a) return privately(NO_SUCH_AGENT);
    const claims = (await claimsQuery(gameId, a.id).get()).docs;
    if (claims.some((d) => d.get('userId') !== user) && !manage) return privately('Releasing someone else\'s Agent needs the Manage Channels permission.');
    await Promise.all(claims.map((d) => d.ref.delete()));
    return reply(`${bold(a.label)} is free to claim.`);
  }

  const logEntry = (e: Roll, agentId: string, viaWebhook: boolean) => logged(e, agentId, viaWebhook, now);

  // `/dg roll test:2D6+1` (plain dice for anything rolled outward: damage dealt, a random table) and `/dg roll test:45`
  // (d% against a number). No claim needed, so the Handler can roll too.
  const typed = str('test').trim();
  if (sub.name === 'roll' && (isDice(typed) || TARGET.test(typed))) {
    const target = Number(typed);
    if (!isDice(typed) && (target < 1 || target > 100)) return privately('A d% roll needs a number from 1 to 100.');
    const [mine, viaWebhook] = await Promise.all([claimed(gameId, user), hasWebhook(gameId)]);
    const name = rollerName(mine?.name ?? null, i.member);
    const e: Roll = isDice(typed)
      ? diceEntry(rollExpression(typed, face)!, name)
      : { ...rollAgainst(target, randomInt(1, 101), num('modifier')), agentName: name };
    await rollsOf(gameId).add(logEntry(e, mine?.id ?? '', viaWebhook));
    return answer(formatEntry(e), viaWebhook);
  }

  const claimFirst = () => privately('Claim your Agent first (`/dg claim`), so it comes off the right sheet.');

  // `/dg damage dice:1D10`: your Agent gets hurt (HP never below 0, p. 55).
  if (sub.name === 'damage') {
    const hit = rollExpression(str('dice'), face);
    if (!hit) return privately('Use dice like `1D10` or `2D6+1`, or a number like `7`.');
    const [agentId, viaWebhook] = await Promise.all([claimId(gameId, user), hasWebhook(gameId)]);
    if (!agentId) return claimFirst();
    const out = await commitLoss(gameId, agentId, viaWebhook, now, (d, name) => applyHit(d, hit, name));
    if (!out) return gone();
    return 'error' in out ? privately(out.error) : answer(formatEntry(out.entry), viaWebhook);
  }

  // `/dg san loss:0/1D6 kind:violence`: SAN test and loss with the live sheet's rules (pp. 66–74), holding the loss for
  // a private projection choice when projecting could reduce it (see sanChoice).
  if (sub.name === 'san') {
    const kind = str('kind') as SanKind;
    if (!SAN_KINDS.includes(kind)) return privately('Pick violence, helplessness or unnatural.');
    const [agentId, viaWebhook] = await Promise.all([claimId(gameId, user), hasWebhook(gameId)]);
    if (!agentId) return claimFirst();
    const [doc, held] = await Promise.all([agentRef(gameId, agentId).get(), heldRef(agentId).get()]);
    if (!doc.exists) return gone();
    const a = agentOf(doc.data()!), name = labelOf(doc);
    // One loss at a time: settle the waiting one first. Say so, so the new loss isn't mistaken for handled.
    const waiting = (h: HeldSan) => {
      const c = sanChoice(h, a, name);
      return privately(`A SAN loss is already waiting for ${bold(name)}. Settle it first; your new loss (\`${plain(str('loss'), 20)}\`) wasn't rolled.\n\n${c.content}`, c.components);
    };
    if (held.exists) return waiting(held.data() as HeldSan);
    const plan = planSan(a, str('loss'), kind, rng);
    if ('error' in plan) return privately(plan.error);
    const test: Roll | undefined = plan.test ? { ...plan.test, agentName: name } : undefined;
    const testLine = test ? formatEntry(test) : '';
    // The test is written together with its loss (or the held loss), so a crash in between can't leave a re-rollable test.
    if (!canProject(a, plan.stake.amount)) {
      return sanSettled(await commitLoss(gameId, agentId, viaWebhook, now, (d, n) => finishSan(agentOf(d), plan.stake, null, n, rng), undefined, test), testLine, viaWebhook, false);
    }
    const h: HeldSan = { ...plan.stake, gameId, agentId, userId: user, testLine, createdAt: now };
    const batch = db().batch();
    if (test) batch.create(rollsOf(gameId).doc(), logged(test, agentId, viaWebhook, now));
    batch.create(heldRef(agentId), h); // create, not set: a second /dg san racing this one fails here instead of replacing it
    try {
      await batch.commit();
    } catch (e) {
      if ((e as { code?: number }).code !== 6) throw e; // 6: ALREADY_EXISTS
      const raced = await heldRef(agentId).get();
      return raced.exists ? waiting(raced.data() as HeldSan) : privately(`Another SAN loss for ${bold(name)} was settled just now. Run \`/dg san\` again for this one.`);
    }
    const c = sanChoice(h, a, name);
    return privately(c.content, c.components);
  }

  const me = await myAgent(gameId, user);
  if (!me) return privately('You haven\'t claimed an Agent in this game. Use `/dg claim` first.');

  if (sub.name === 'sheet') {
    const [name, ...rest] = sheetLines(me.agent);
    return privately([bold(name), ...rest.map((l) => plain(l, 1900))].join('\n'));
  }
  if (sub.name === 'roll') {
    const t = findTest(me.agent, str('test'));
    if (!t) return privately('No stat, skill or test by that name. Pick one from the list.');
    const r = rollTest(me.agent, t, randomInt(1, 101), num('modifier'));
    // Same as the live sheet: a failed skill earns a check toward end-of-session advancement (p. 28).
    const check = t.skill && canImprove(t.label, t.chance) && !isSuccess(r.outcome) && me.agent.hasLive && !me.agent.l.checked.includes(t.label);
    // rollToDiscord posts it when there's a webhook; otherwise `answered` tells it the bot already replied in the channel.
    const viaWebhook = await hasWebhook(gameId);
    const batch = db().batch();
    batch.create(rollsOf(gameId).doc(), logEntry({ ...r, agentName: me.agent.name }, me.id, viaWebhook));
    if (check) batch.update(agentRef(gameId, me.id), { 'live.checked': FieldValue.arrayUnion(t.label), updatedAt: now });
    await batch.commit();
    const text = formatRoll({ ...r, agentName: me.agent.name }) + (check ? ' · marked for improvement' : '');
    return answer(text, viaWebhook);
  }
  return privately('Unknown command.');
}
