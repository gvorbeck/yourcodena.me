import { z } from 'zod';
import { parseCharacter, type Character } from './character';
import { bondCount, derived, rollExpr, veteranOf } from '../rules';
import { STATS, type Stat } from '../rules/data/creation';

/** Play-time state. The whole sheet lives in the URL hash, so no server or database is involved. */
export const MAX_NOTES = 4000;
const n = z.number().int().min(0).max(999);
const statKey = z.enum(STATS);
const hpMark = z.number().int().min(0).max(999).nullable();
const spentSchema = z.object({ healHp: hpMark, injuryHp: hpMark, rest: z.boolean(), sleep: z.boolean() });
const noneSpent = { healHp: null, injuryHp: null, rest: false, sleep: false };
const track = z.number().int().min(0).max(3);
const liveSchema = z.object({
  hp: n, wp: n, san: n, bp: n,
  bonds: z.array(n).max(20), notes: z.string().max(MAX_NOTES).default(''),
  // Added after v1 links existed, so each has a default.
  penalty: n.max(60).default(0), // sickness, drugs, injury: flat −% to every test
  exhausted: z.boolean().default(false), // −20% to every test until a full night's sleep (p. 47)
  adapt: z.object({ v: track, h: track }).default({ v: 0, h: 0 }), // p. 74: boxes toward adapting to violence / helplessness
  statMod: z.record(statKey, z.number().int().min(-18).max(0)).default({}), // permanent stat changes (injury, adaptation)
  statLoss: z.record(statKey, z.number().int().min(0).max(18)).default({}), // temporary stat loss, restored 1 per night (p. 55)
  spent: spentSchema.default(noneSpent), // once-per-event actions: HP after the last first aid / at the last injury test (null = unused), and today's rest and sleep
});
export type Live = z.infer<typeof liveSchema>;
export const parseLive = (raw: unknown): Live => liveSchema.parse(raw);

export const freshLive = (c: Character): Live => {
  const d = derived(c);
  return { hp: d.hp, wp: d.wp, san: d.san, bp: d.bp, bonds: Array(bondCount(c)).fill(d.bondScore), notes: '', penalty: 0, exhausted: false, adapt: { v: 0, h: 0, [veteranOf(c)?.adapts ?? 'v']: veteranOf(c)?.adapts ? 3 : 0 }, statMod: {}, statLoss: {}, spent: { ...noneSpent } };
};

/** True until anything has been played or noted: the sheet still equals what `c` derives, so it can be rebuilt if `c` changes. */
export const untouched = (l: Live, c: Character) => !l.notes && sameState(l, freshLive(c));

/** Replace one Bond score without disturbing the others; holes (a link with fewer scores than Bonds) take `fallback`. */
export const withBond = (bonds: number[], i: number, v: number, fallback: number) =>
  Array.from({ length: Math.max(bonds.length, i + 1) }, (_, k) => (k === i ? Math.max(0, v) : bonds[k] ?? fallback));

/** First aid is once per injury (p. 55): usable again once HP is below where the last aid left it. Always usable at 0 HP (resuscitation). */
export const canHeal = (l: Live) => l.hp === 0 || l.spent.healHp === null || l.hp < l.spent.healHp;
/** One injury test each time the Agent is reduced to 2 HP or fewer: usable again after further damage. */
export const canInjuryTest = (l: Live) => l.spent.injuryHp === null || l.hp < l.spent.injuryHp;
/** Once HP is back above 2 the next drop to 2 is a new event, so the injury test is available again. */
export const refreshSpent = (l: Live): Live => (l.hp > 2 && l.spent.injuryHp !== null ? { ...l, spent: { ...l.spent, injuryHp: null } } : l);

const sameRec = (a: Partial<Record<string, number>>, b: Partial<Record<string, number>>) =>
  [...new Set([...Object.keys(a), ...Object.keys(b)])].every((k) => (a[k] ?? 0) === (b[k] ?? 0)); // a missing key means 0
/** Same for undo purposes: only the sheet's numbers count. Notes are free text and `spent` follows HP. */
export const sameState = (a: Live, b: Live) =>
  a.hp === b.hp && a.wp === b.wp && a.san === b.san && a.bp === b.bp && a.penalty === b.penalty && a.exhausted === b.exhausted
  && a.adapt.v === b.adapt.v && a.adapt.h === b.adapt.h
  && a.bonds.length === b.bonds.length && a.bonds.every((x, i) => x === b.bonds[i])
  && sameRec(a.statMod, b.statMod) && sameRec(a.statLoss, b.statLoss);

/** Short description of what changed between two states, for the Undo button: "HP 8→7", "SAN 37→33, WP 8→6 +1". */
export function describeChange(a: Live, b: Live, bondNames: string[] = []): string {
  const parts: string[] = [];
  const num = (name: string, x: number, y: number) => { if (x !== y) parts.push(`${name} ${x}→${y}`); };
  num('HP', a.hp, b.hp); num('WP', a.wp, b.wp); num('SAN', a.san, b.san); num('BP', a.bp, b.bp); num('Penalty', a.penalty, b.penalty);
  if (a.exhausted !== b.exhausted) parts.push(b.exhausted ? 'exhausted' : 'rested');
  b.bonds.forEach((y, i) => num(bondNames[i]?.trim() || `Bond ${i + 1}`, a.bonds[i] ?? y, y));
  if (a.adapt.v !== b.adapt.v) parts.push('violence adaptation');
  if (a.adapt.h !== b.adapt.h) parts.push('helplessness adaptation');
  for (const st of STATS) {
    num(`${st} (permanent)`, a.statMod[st] ?? 0, b.statMod[st] ?? 0);
    num(`${st} lost`, a.statLoss[st] ?? 0, b.statLoss[st] ?? 0);
  }
  if (!parts.length) return 'last change';
  return parts.length > 2 ? `${parts.slice(0, 2).join(', ')} +${parts.length - 2}` : parts.join(', ');
}

/** Undo history. Snapshots leave out Notes: undoing restores the numbers but keeps whatever is typed. */
export class UndoStack {
  private snaps: { snap: Omit<Live, 'notes'>; label: string }[] = [];
  get size() { return this.snaps.length; }
  /** What the next undo would revert, or null when there is nothing to undo. */
  get label() { return this.snaps.length ? this.snaps[this.snaps.length - 1].label : null; }
  /** Remember `before` unless the change touched only notes or once-per-event flags. */
  record(before: Live, after: Live, bondNames?: string[]) {
    if (sameState(before, after)) return false;
    const { notes: _notes, ...snap } = before;
    this.snaps = [...this.snaps, { snap, label: describeChange(before, after, bondNames) }].slice(-30);
    return true;
  }
  undo(current: Live): Live | null {
    const top = this.snaps.pop();
    return top ? { ...top.snap, notes: current.notes } : null;
  }
}

const mod = (l: Live, s: Stat) => l.statMod[s] ?? 0;
/** The Agent with permanent stat changes applied; derive HP / WP caps from this. */
export const permStats = (c: Character, l: Live): Character => ({ ...c, stats: Object.fromEntries(STATS.map((s) => [s, c.stats[s] + mod(l, s)])) as Character['stats'] });
/** Score to test against: permanent changes and temporary loss applied. */
export const effStat = (c: Character, l: Live, s: Stat) => Math.max(0, c.stats[s] + mod(l, s) - (l.statLoss[s] ?? 0));

/** Permanent stat loss, to a minimum score of 3 (p. 55); HP / WP are pulled down to the new caps. */
export function loseStat(c: Character, l: Live, s: Stat, amount: number): { live: Live; lost: number } {
  const lost = Math.max(0, Math.min(amount, c.stats[s] + mod(l, s) - 3));
  const live = { ...l, statMod: { ...l.statMod, [s]: mod(l, s) - lost } };
  const d = derived(permStats(c, live));
  return { live: { ...live, hp: Math.min(live.hp, d.hp), wp: Math.min(live.wp, d.wp) }, lost };
}

export type SanKind = 'violence' | 'helplessness' | 'unnatural';

/** p. 74: three SAN-losing hits of one kind in a row adapt the Agent; insanity or a Breaking Point resets the count. */
export const adapt = (count: number, reset: boolean) => {
  if (count >= 3) return { count: 3, adapted: false };
  if (reset) return { count: 0, adapted: false };
  return { count: count + 1, adapted: count === 2 };
};

/** Apply a SAN loss (pp. 67–74). `notes` lists what the Handler and player now owe the table. */
export function loseSan(c: Character, l: Live, loss: number, kind: SanKind, rng = Math.random): { live: Live; notes: string[] } {
  const notes: string[] = [];
  const san = Math.max(0, l.san - loss);
  const insane = loss >= 5;
  const breaking = loss > 0 && l.san > l.bp && san <= l.bp;
  let live: Live = { ...l, san };
  if (insane) notes.push('Temporary insanity (p. 69): Flee, Struggle or Submit.');
  if (san === 0) notes.push('0 SAN: permanent insanity (p. 73). The Agent now belongs to the Handler.');
  if (breaking) {
    live.bp = Math.max(0, san - derived(permStats(c, l)).pow); // current POW, veteran penalty included
    notes.push(`Breaking Point reached: gain a disorder (p. 69). New Breaking Point ${live.bp}.`);
  }
  if (kind !== 'unnatural' && loss >= 1) {
    const k = kind === 'violence' ? 'v' : 'h';
    const a = adapt(l.adapt[k], insane || breaking);
    live.adapt = { ...l.adapt, [k]: a.count };
    if (a.adapted) {
      const x = rollExpr('1D6', rng)!;
      if (kind === 'violence') {
        const r = loseStat(c, live, 'CHA', x);
        live = { ...r.live, bonds: r.live.bonds.map((b) => Math.max(0, b - x)) };
        notes.push(`Adapted to violence (p. 74): permanently lost ${r.lost} CHA and ${x} from every Bond. SAN rolls for violence now always succeed.`);
      } else {
        const r = loseStat(c, live, 'POW', x);
        live = r.live;
        notes.push(`Adapted to helplessness (p. 74): permanently lost ${r.lost} POW. SAN rolls for helplessness now always succeed.`);
      }
    }
  }
  return { live, notes };
}

const PREFIX = '#sheet=';
// shortcut: plain base64url JSON, no compression (~2 KB URLs), add deflate if links get too long to paste.
// Chunked: spreading a large array into fromCharCode overflows the argument limit.
const bin = (b: Uint8Array) => Array.from({ length: Math.ceil(b.length / 8192) }, (_, i) => String.fromCharCode(...b.subarray(i * 8192, (i + 1) * 8192))).join('');
const b64 = (s: string) => btoa(bin(new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (ch) => ch.charCodeAt(0)));

export const encodeSheet = (c: Character, l: Live) => PREFIX + b64(JSON.stringify({ c, l }));

export function decodeSheet(hash: string): { c: Character; l: Live } | null {
  if (!hash.startsWith(PREFIX)) return null;
  try {
    const raw = JSON.parse(unb64(hash.slice(PREFIX.length)));
    return { c: parseCharacter(raw.c), l: liveSchema.parse(raw.l) };
  } catch { return null; }
}

