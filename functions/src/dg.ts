// Discord-side play: the same tests, chances and outcomes as the live sheet (src/LiveSheet.tsx), built from the app's own rules.
import { parseCharacter, type Character } from '../../src/model/character';
import { effStat, freshLive, maxSanOf, parseLive, permStats, type Live } from '../../src/model/live';
import { agentLabel } from '../../src/model/names';
import { derived, liveOutcome, parseDice, rollDice, skillsOf } from '../../src/rules';
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

// ---- Damage (Agent's Handbook pp. 56–57). Not a percentile test, so it never goes in the roll log.
export type Damage =
  | { kind: 'dice'; expr: string; dice: number[]; mod: number; total: number; critical: boolean }
  | { kind: 'lethality'; rating: number; roll: number; killed: boolean; dice: [number, number]; total: number; critical: boolean };

const LETHALITY = /^(?:l|lethality)\s*(\d{1,3})\s*%?$|^(\d{1,3})\s*%$/i;

/** A modifier as written after dice: "+1", "-2", or nothing. */
export const modText = (mod: number) => (mod > 0 ? `+${mod}` : mod < 0 ? `${mod}` : '');

/**
 * "1D10", "2D6+1", "3" (flat), or a Lethality rating "L15" / "15%". A critical attack doubles damage (p. 52); for Lethality
 * it doubles the rating and, if the target survives, the damage (p. 57). `rand(n)` returns 1…n.
 */
export function rollDamage(input: string, critical: boolean, rand: (sides: number) => number): Damage | null {
  const s = input.trim();
  const l = LETHALITY.exec(s);
  if (l) {
    const rating = Number(l[1] ?? l[2]);
    if (rating < 1 || rating > 100) return null;
    const roll = rand(100);
    // Failed Lethality: the two percentile dice added as d10s, 0 counting as 10 (so 80 is 8 + 10).
    const dice: [number, number] = [Math.floor((roll % 100) / 10) || 10, roll % 10 || 10];
    const killed = roll <= (critical ? rating * 2 : rating);
    const sum = dice[0] + dice[1];
    return { kind: 'lethality', rating, roll, killed, dice, total: killed ? 0 : critical ? sum * 2 : sum, critical };
  }
  const p = parseDice(s);
  if (!p) return null;
  const dice = rollDice(p, rand);
  const sum = (p.sides ? dice.reduce((a, b) => a + b, 0) : p.count) + p.mod;
  const expr = p.sides ? `${p.count}D${p.sides}${modText(p.mod)}` : `${p.count}${modText(p.mod)}`;
  return { kind: 'dice', expr, dice, mod: p.mod, total: Math.max(0, critical ? sum * 2 : sum), critical };
}
