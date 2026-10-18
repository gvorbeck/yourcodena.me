import type { Character } from './character';
import { derived, parseLoss, rollExpr, rollLoss, type Outcome } from '../rules';
import type { Stat } from '../rules/data/creation';
import { loseStat, permStats, withBond, type Live, type SanKind } from './live';

/**
 * Play-time actions as pure functions: each takes the current state (and `rng`, so tests can fix the dice) and returns
 * the new state plus what to tell the table. The Live Sheet only decides when to call them and shows the notes.
 */
export interface Result { live: Live; notes: string[] }
type Rng = () => number;
const dice = (expr: string, rng: Rng) => rollExpr(expr, rng) ?? 0;
const caps = (c: Character, l: Live) => derived(permStats(c, l));

// ---- Fumbles (p. 44)
export function strain(l: Live, rng: Rng = Math.random): Result {
  const n = dice('1D6', rng);
  return { live: { ...l, hp: Math.max(0, l.hp - n) }, notes: [`Physical strain: lost ${n} HP.`] };
}
export function burnout(l: Live, rng: Rng = Math.random): Result {
  const n = dice('1D6', rng);
  return { live: { ...l, wp: Math.max(0, l.wp - n) }, notes: [`Emotional burnout: lost ${n} WP.`] };
}
export function exhaust(l: Live, rng: Rng = Math.random): Result {
  const n = dice('1D6', rng);
  return { live: { ...l, wp: Math.max(0, l.wp - n), exhausted: true }, notes: [`Exhausted: lost ${n} WP, −20% to all tests until a full night's sleep (p. 47).`] };
}

// ---- Damage and healing (pp. 54–55)
export function heal(c: Character, l: Live, rng: Rng = Math.random): Result {
  const n = dice('1D4', rng), hp = Math.min(caps(c, l).hp, l.hp + n);
  return { live: { ...l, hp, spent: { ...l.spent, healHp: hp } }, notes: [`Healed ${n} HP. First Aid or treatment doubles on a critical, and a fumble does 1D4 damage (p. 55).`] };
}

/** Recuperation after the CON×5 rest test: 1 HP, 1D4 on a critical, −1 on a fumble. */
export function recuperate(c: Character, l: Live, outcome: Outcome, rng: Rng = Math.random): Live {
  const n = outcome === 'critical success' ? dice('1D4', rng) : outcome === 'success' ? 1 : outcome === 'fumble' ? -1 : 0;
  return { ...l, hp: Math.max(0, Math.min(caps(c, l).hp, l.hp + n)), spent: { ...l.spent, rest: true } };
}

/** The injury test is used up the moment it is rolled, whatever the result. */
export const spendInjuryTest = (l: Live): Live => ({ ...l, spent: { ...l.spent, injuryHp: l.hp } });

const tenth = (v: number) => v || 10; // a 0 on a d10 reads as 10
/** Permanent-injury loss (p. 55): the lowest d10 of the failed percentile roll, where 0 reads as 10. */
export const lowestD10 = (roll: number) => Math.min(tenth(Math.floor((roll % 100) / 10)), tenth(roll % 10));

export function sleep(c: Character, l: Live, rng: Rng = Math.random): Result {
  const n = dice('1D6', rng);
  const statLoss = Object.fromEntries(Object.entries(l.statLoss).map(([k, v]) => [k, Math.max(0, v - 1)]));
  return {
    live: { ...l, wp: Math.min(caps(c, l).wp, l.wp + n), exhausted: false, spent: { ...l.spent, sleep: true }, statLoss },
    notes: [`Full night's sleep: +${n} WP (once per 24 h), exhaustion cured, 1 point of each lost stat restored. After insanity or a new disorder, make a SAN test first (p. 47).`],
  };
}

/** Temporary stat loss (restored a point per night), kept between 0 and 18. */
export const adjustStatLoss = (l: Live, s: Stat, by: number): Live =>
  ({ ...l, statLoss: { ...l.statLoss, [s]: Math.max(0, Math.min(18, (l.statLoss[s] ?? 0) + by)) } });

export function applyInjury(c: Character, l: Live, stat: Stat, amount: number): Result {
  const r = loseStat(c, l, stat, amount);
  return { live: r.live, notes: [`Permanently lost ${r.lost} ${stat}.`] };
}

// ---- Sanity (pp. 66–75)
export interface PendingSan { kind: SanKind; amount: number; result: string }

/** Adapted (three boxes) to violence or helplessness; there is no adapting to the Unnatural (p. 74). */
export const adapted = (l: Live, kind: SanKind) => (kind === 'violence' ? l.adapt.v : kind === 'helplessness' ? l.adapt.h : 0) >= 3;

/**
 * Work out a SAN loss before it is applied. `test` makes the SAN roll; it is not called when adaptation passes it
 * automatically (an Agent at 0 WP can't succeed at anything, so they still roll).
 */
export function planSanLoss(l: Live, kind: SanKind, expr: string, test: () => { ok: boolean; roll: number; chance: number }, rng: Rng = Math.random): PendingSan | { error: string } {
  const loss = parseLoss(expr);
  if (!loss) return { error: 'SAN loss must be written success/failure, like 0/1D4 or 1/1D10.' };
  const auto = adapted(l, kind) && l.wp > 0;
  const t = auto ? null : test();
  const ok = auto || !!t?.ok;
  const result = auto ? `Adapted to ${kind}: the SAN test automatically succeeds (p. 74).` : `${ok ? 'Passed' : 'Failed'} the SAN test (rolled ${t!.roll} against ${t!.chance}%).`;
  return { kind, amount: rollLoss(ok ? loss[0] : loss[1], rng) ?? 0, result };
}

/**
 * Spend 1D4 WP and strain a Bond by the same amount (pp. 74–75). If no WP is left afterwards nothing helps and the
 * Bond is spared (`ok` false); the WP is gone either way.
 */
export function spendWillpower(c: Character, l: Live, bond: number, rng: Rng = Math.random): { live: Live; n: number; ok: boolean } {
  const n = dice('1D4', rng), wp = Math.max(0, l.wp - n), score = caps(c, l).bondScore;
  const ok = wp >= 1;
  return { live: { ...l, wp, bonds: ok ? withBond(l.bonds, bond, (l.bonds[bond] ?? score) - n, score) : l.bonds }, n, ok };
}

export function project(c: Character, l: Live, pending: PendingSan, bond: number, rng: Rng = Math.random): { live: Live; pending: PendingSan; notes: string[] } {
  const s = spendWillpower(c, l, bond, rng);
  if (!s.ok) return { live: s.live, pending, notes: [`Spent ${s.n} WP but none is left: the loss stands.`] };
  return {
    live: s.live,
    pending: { ...pending, amount: Math.max(0, pending.amount - s.n) },
    notes: [`Projected onto a Bond: spent ${s.n} WP, SAN loss reduced by ${s.n}, Bond reduced by ${s.n}. Describe the strain (p. 74).`],
  };
}

/** `test` makes the SAN roll with the WP left after the spend (low WP still carries its penalty). */
export function repress(c: Character, l: Live, bond: number, test: (wp: number) => boolean, rng: Rng = Math.random): Result {
  const s = spendWillpower(c, l, bond, rng);
  if (!s.ok) return { live: s.live, notes: [`Spent ${s.n} WP but none is left: cannot repress.`] };
  return {
    live: s.live,
    notes: [test(s.live.wp) ? `Spent ${s.n} WP and ${s.n} Bond points: the episode is suppressed (p. 75).` : `Spent ${s.n} WP and ${s.n} Bond points, but the episode takes hold.`],
  };
}

// ---- Mind and skills
export function addDisorder(l: Live, name: string, lostMotivation: string): Result {
  const dropped = lostMotivation ? [...l.dropped, lostMotivation] : l.dropped;
  return { live: { ...l, disorders: [...l.disorders, name], dropped }, notes: [`Gained ${name}${lostMotivation ? `; lost the motivation “${lostMotivation}”` : ''} (pp. 38, 69).`] };
}

/** A failed skill roll earns a check toward end-of-session advancement (p. 28). */
export const checkSkill = (l: Live, key: string): Live => (l.checked.includes(key) ? l : { ...l, checked: [...l.checked, key] });
