// Discord-side play: the same tests, chances and outcomes as the live sheet (src/LiveSheet.tsx), built from the app's own rules.
import { parseCharacter, type Character } from '../../src/model/character';
import { effStat, freshLive, maxSanOf, parseLive, permStats, type Live } from '../../src/model/live';
import { agentLabel } from '../../src/model/names';
import { derived, diceText, liveOutcome, parseDice, rollDice, skillsOf, testOutcome } from '../../src/rules';
import type { DamageEntry, DiceEntry, TestEntry } from '../../src/rules/outcome';
import { STATS, STAT_NAMES } from '../../src/rules/data/creation';

export interface Test { id: string; label: string; name: string; chance: number; skill: boolean }
export interface Agent { name: string; c: Character; l: Live; hasLive: boolean }

/** An agent document as stored at games/{gameId}/agents/{agentId}. Before the live sheet is first opened, play state is the fresh one. */
export function agentOf(d: { character?: unknown; live?: unknown }): Agent {
  const c = parseCharacter(d.character);
  return { name: agentLabel(c.details.codename, c.details.name), c, l: d.live ? parseLive(d.live) : freshLive(c), hasLive: Boolean(d.live) };
}

/** Everything rollable on the live sheet, with the labels the roll log already uses. */
export function testsOf({ c, l }: Agent): Test[] {
  return [
    ...STATS.map((s) => ({ id: `stat:${s}`, label: s, name: `${s} ${STAT_NAMES[s]}`, chance: effStat(c, l, s) * 5, skill: false })),
    { id: 'luck', label: 'Luck', name: 'Luck', chance: 50, skill: false },
    { id: 'san', label: 'SAN test', name: 'SAN', chance: l.san, skill: false },
    ...skillsOf(c, l.advance).map((s) => ({ id: `skill:${s.key}`, label: s.key, name: s.key, chance: s.total, skill: true })),
  ].filter((t) => t.id.length <= 100); // Discord's limit on a choice value
}

/** Autocomplete: up to 25 matches for what the player has typed so far. */
export const choicesFor = (a: Agent, typed: string) => {
  const q = typed.trim().toLowerCase();
  return testsOf(a).filter((t) => t.name.toLowerCase().includes(q)).slice(0, 25).map((t) => ({ name: `${t.name} ${t.chance}%`, value: t.id }));
};

/** A picked choice, or typed text that names exactly one test. */
export function findTest(a: Agent, value: string): Test | null {
  const tests = testsOf(a), q = value.trim().toLowerCase();
  const exact = tests.find((t) => t.id === value || t.name.toLowerCase() === q || t.label.toLowerCase() === q);
  if (exact) return exact;
  const some = tests.filter((t) => t.name.toLowerCase().includes(q));
  return some.length === 1 ? some[0] : null;
}

/** Same as the live sheet's test(): WP penalty, the sheet's flat penalty and exhaustion, plus a signed modifier (−20 is a penalty). */
export function rollTest({ l }: Agent, t: Test, roll: number, modifier = 0) {
  const { chance, pen, outcome } = liveOutcome(roll, t.chance, l.wp, l.penalty + (l.exhausted ? 20 : 0) - modifier);
  return { label: t.label, chance, penalty: Math.max(0, pen), roll, outcome };
}

/** /dg sheet: current and maximum values, the same ones the live sheet shows. */
export function sheetLines({ name, c, l }: Agent): string[] {
  const d = derived(permStats(c, l));
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
  return { expr: diceText(p), dice, mod: p.mod, total: Math.max(0, (p.sides ? dice.reduce((a, b) => a + b, 0) : p.count) + p.mod) };
}

/** True for real dice ("2D6+1"), false for a flat number or anything else: a number typed into `test:` means d%. */
export const isDice = (input: string) => Boolean(parseDice(input)?.sides);

/** A plain d% roll against a typed number ("45"), with the same signed modifier as a test. No sheet penalties apply. */
export function rollAgainst(target: number, roll: number, modifier = 0): Omit<TestEntry, 'agentName'> {
  const chance = Math.max(0, target + modifier);
  return { label: 'd%', chance, penalty: Math.max(0, -modifier), roll, outcome: testOutcome(roll, chance) };
}

/** The roll-log entry for plain dice. */
export const diceEntry = (r: DiceRoll, agentName: string): DiceEntry =>
  ({ kind: 'dice', label: r.expr, dice: r.dice, mod: r.mod, roll: r.total, agentName, chance: 0, penalty: 0, outcome: '' });

/**
 * `/dg damage` against a stored agent doc: HP before and after (never below 0, p. 55), the Firestore update, and the
 * roll-log entry. Reads only `live.hp`, so a sheet that won't fully parse still takes damage; a sheet whose live
 * play hasn't been saved yet starts from its fresh state.
 */
export function applyHit(d: { name?: unknown; codename?: unknown; character?: unknown; live?: { hp?: unknown } | null }, hit: DiceRoll, agentName: string, now: number) {
  const hp = d.live?.hp;
  const fresh = typeof hp === 'number' ? null : freshLive(parseCharacter(d.character));
  const hpFrom = fresh ? fresh.hp : (hp as number), hpTo = Math.max(0, hpFrom - hit.total);
  const update: Record<string, unknown> = fresh ? { live: { ...fresh, hp: hpTo }, updatedAt: now } : { 'live.hp': hpTo, updatedAt: now };
  const entry: DamageEntry = { ...diceEntry(hit, agentName), kind: 'damage', hpFrom, hpTo };
  return { update, entry };
}
