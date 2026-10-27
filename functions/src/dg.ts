// Discord-side play: the same tests, chances and outcomes as the live sheet (src/LiveSheet.tsx), built from the app's own rules.
import { parseCharacter, type Character } from '../../src/model/character';
import { capsOf, freshLive, loseSan, maxSanOf, parseLive, sheetPenalty, testsOf as sheetTests, SAN_LOSS, type Live, type SanKind, type Test } from '../../src/model/live';
import { planSanLoss, projectRolled } from '../../src/model/actions';
import { diffPaths, type Change } from '../../src/lib/diff';
import { agentLabel } from '../../src/model/names';
import { activeBonds, matches, sameText, diceText, diceTotal, isSuccess, liveOutcome, parseDice, parseLoss, rollDice, rollLoss, testOutcome } from '../../src/rules';
import { hurtNote, type DiceEntry, type LossEntry, type LossStat, type TestEntry } from '../../src/rules/outcome';

export type { Test };
export interface Agent { name: string; c: Character; l: Live; hasLive: boolean }

/** An agent document as stored at games/{gameId}/agents/{agentId}. Before the live sheet is first opened, play state is the fresh one. */
export function agentOf(d: { character?: unknown; live?: unknown }): Agent {
  const c = parseCharacter(d.character);
  return { name: agentLabel(c.details.codename, c.details.name), c, l: d.live ? parseLive(d.live) : freshLive(c), hasLive: Boolean(d.live) };
}

/** Everything rollable on the live sheet (model/live.ts), with the labels the roll log already uses. */
export const testsOf = (a: Agent): Test[] => sheetTests(a).filter((t) => t.id.length <= 100); // Discord's limit on a choice value

/** Autocomplete: up to 25 matches for what the player has typed so far. */
export const choicesFor = (a: Agent, typed: string) => {
  return testsOf(a).filter((t) => matches(t.name, typed)).slice(0, 25).map((t) => ({ name: `${t.name} ${t.chance}%`, value: t.id }));
};

/** A picked choice, or typed text that names exactly one test. */
export function findTest(a: Agent, value: string): Test | null {
  const tests = testsOf(a);
  const exact = tests.find((t) => t.id === value || sameText(t.name, value) || sameText(t.label, value));
  if (exact) return exact;
  const some = tests.filter((t) => matches(t.name, value));
  return some.length === 1 ? some[0] : null;
}

/** Same as the live sheet's test(): WP penalty, the sheet's flat penalty and exhaustion, plus a signed modifier (−20 is a penalty). */
export function rollTest({ l }: Agent, t: Test, roll: number, modifier = 0) {
  const { chance, pen, outcome } = liveOutcome(roll, t.chance, l.wp, sheetPenalty(l) - modifier);
  return { label: t.label, chance, penalty: Math.max(0, pen), roll, outcome };
}

/** /dg sheet: current and maximum values, the same ones the live sheet shows. */
export function sheetLines({ name, c, l }: Agent): string[] {
  const d = capsOf(c, l);
  const notes = [l.exhausted && 'Exhausted (−20%)', l.penalty && `Penalty −${l.penalty}%`, l.wp > 0 && l.wp <= 2 && 'Low WP (−20%)', l.wp === 0 && 'WP 0: every test fails'].filter(Boolean);
  return [
    name,
    `HP ${l.hp}/${d.hp} · WP ${l.wp}/${d.wp} · SAN ${l.san}/${maxSanOf(c, l)} · BP ${l.bp}`,
    ...(notes.length ? [notes.join(' · ')] : []),
    ...(l.checked.length ? [`Marked for improvement: ${l.checked.join(', ')}`] : []),
  ];
}

// ---- Plain dice: `/dg roll test:2D6+1` (anything you roll outward, like damage you deal) and `/dg damage` (HP you lose).
export interface DiceRoll { expr: string; dice: number[]; mod: number; total: number }

/** "1D10", "2D6+1", "1D4-1" or a flat "3", rolled with `rand(n)` → 1…n. Null when it isn't dice notation. */
export function rollExpression(input: string, rand: (sides: number) => number): DiceRoll | null {
  const p = parseDice(input);
  if (!p) return null;
  const dice = rollDice(p, rand);
  return { expr: diceText(p), dice, mod: p.mod, total: diceTotal(p, dice) };
}

/** True for real dice ("2D6+1"), false for a flat number or anything else: a number typed into `test:` means d%. */
export const isDice = (input: string) => Boolean(parseDice(input)?.sides);

/** A plain d% roll against a typed number ("45"), with the same signed modifier as a test. No sheet penalties apply. */
export function rollAgainst(target: number, roll: number, modifier = 0): Omit<TestEntry, 'agentName'> {
  const chance = Math.max(0, target + modifier);
  return { label: 'd%', chance, penalty: Math.max(0, -modifier), roll, outcome: testOutcome(roll, chance) };
}

/** Placeholder test fields on entries that aren't d% tests (see DiceEntry in rules/outcome.ts). */
const NOT_A_TEST = { chance: 0, penalty: 0, outcome: '' };
/** The roll-log entry for plain dice. */
export const diceEntry = (r: DiceRoll, agentName: string): DiceEntry =>
  ({ kind: 'dice', label: r.expr, dice: r.dice, mod: r.mod, roll: r.total, agentName, ...NOT_A_TEST });

// ---- Losing HP or SAN (/dg damage, /dg san). Both come off the claimed Agent's sheet the same way: the leaves of the
// agent doc to write (paths from the doc root, so an open sheet can merge them) plus one roll-log entry.
export interface Loss { leaves: Change[]; entry: LossEntry }
type AgentDoc = { character?: unknown; live?: { hp?: unknown } | null };

/** Only the `live` leaves that changed; the whole `live` when live play was never saved. */
export const liveLeaves = (before: Live, after: Live, hasLive: boolean): Change[] =>
  hasLive ? diffPaths(before, after, ['live']) : [[['live'], after]];

const lossEntry = (stat: LossStat, label: string, r: { dice: number[]; mod: number; total: number }, from: number, to: number, notes: string[], agentName: string, cause?: string): LossEntry =>
  ({ kind: 'loss', stat, label, dice: r.dice, mod: r.mod, roll: r.total, from, to, notes, ...(cause ? { cause } : {}), agentName, ...NOT_A_TEST });

/**
 * `/dg damage`: HP before and after (never below 0, p. 55) and what the hit means. Reads only `live.hp`, so a sheet
 * that won't fully parse still takes damage; a sheet whose live play hasn't been saved yet starts from its fresh state.
 */
export function applyHit(d: AgentDoc, hit: DiceRoll, agentName: string): Loss {
  const hp = d.live?.hp;
  const fresh = typeof hp === 'number' ? null : freshLive(parseCharacter(d.character));
  const from = fresh ? fresh.hp : (hp as number), to = Math.max(0, from - hit.total);
  const leaves: Change[] = fresh ? [[['live'], { ...fresh, hp: to }]] : [[['live', 'hp'], to]];
  return { leaves, entry: { ...lossEntry('HP', hit.expr, hit, from, to, [hurtNote(from, to)].filter(Boolean), agentName), hpFrom: from, hpTo: to } };
}

// ---- SAN loss in three steps, so the bot can stop between them and ask about projecting onto a Bond (p. 74).
/** A SAN loss decided but not applied: what was rolled, how much is at stake, and any note (auto-pass when adapted). */
export interface SanStake { kind: SanKind; expr: string; amount: number; note: string }

/**
 * Step 1, the live sheet's own rules: "0/1D6" makes the SAN test (same math as the sheet; adaptation passes it
 * automatically) and rolls the side it lands on; plain dice ("1D6") are lost without a test. `test` is the d% roll
 * to log, null when there was none. `rng` is Math.random-shaped.
 */
export function planSan(a: Agent, loss: string, kind: SanKind, rng: () => number): { stake: SanStake; test: Omit<TestEntry, 'agentName'> | null } | { error: string } {
  const expr = loss.trim().toUpperCase().replace(/\s+/g, '');
  if (parseLoss(expr)) {
    let test: Omit<TestEntry, 'agentName'> | null = null;
    const sanTest: Test = { id: 'san', label: SAN_LOSS, name: 'SAN', chance: a.l.san, skill: false };
    const plan = planSanLoss(a.l, kind, expr, () => {
      test = rollTest(a, sanTest, 1 + Math.floor(rng() * 100));
      return { ok: isSuccess(test.outcome), roll: test.roll, chance: test.chance };
    }, rng);
    if ('error' in plan) return plan;
    return { stake: { kind, expr, amount: plan.amount, note: test ? '' : plan.result }, test };
  }
  if (parseDice(expr)) return { stake: { kind, expr, amount: rollLoss(expr, rng) ?? 0, note: '' }, test: null };
  return { error: 'Write SAN loss like `0/1D4` (with a SAN test) or `1D6` (no test).' };
}

export interface Bond { i: number; name: string; score: number }
/** Bonds that can take a projection: named, with points left. */
export function bondsOf({ c, l }: Agent): Bond[] {
  const score = capsOf(c, l).bondScore;
  return activeBonds(c).map((b) => ({ i: b.i, name: b.name, score: l.bonds[b.i] ?? score })).filter((b) => b.score > 0);
}
/** Step 2's gate: projecting can only help with a loss to reduce, a Bond with points and at least 2 WP (1 must remain after spending 1D4, p. 74). */
export const canProject = (a: Agent, amount: number) => amount > 0 && a.l.wp >= 2 && bondsOf(a).length > 0;

/**
 * Step 3: optionally project onto `projection.bond` with an already rolled `projection.n` WP (the site's own
 * projectRolled), then apply what's left with loseSan: temporary insanity, Breaking Point, adaptation (pp. 69–74).
 */
export function finishSan(a: Agent, stake: SanStake, projection: { bond: number; n: number } | null, agentName: string, rng: () => number): Loss {
  let l = a.l, amount = stake.amount;
  const notes = stake.note ? [stake.note] : [];
  if (projection) {
    const p = projectRolled(a.c, l, { kind: stake.kind, amount, result: '' }, projection.bond, projection.n);
    const bond = bondsOf(a).find((b) => b.i === projection.bond);
    if (bond && p.live.bonds[bond.i] !== l.bonds[bond.i]) notes.push(`${bond.name} ${bond.score} → ${p.live.bonds[bond.i]}`);
    notes.push(...p.notes);
    l = p.live;
    amount = p.pending.amount;
  }
  const r = loseSan(a.c, l, amount, stake.kind, rng);
  return { leaves: liveLeaves(a.l, r.live, a.hasLive), entry: lossEntry('SAN', stake.expr, { dice: [], mod: 0, total: amount }, a.l.san, r.live.san, [...notes, ...r.notes], agentName, stake.kind) };
}
