import type { Character } from '../model/character';
import { STATS, STAT_SETS, POINT_BUY_TOTAL, VETERANS, FEATURES, type Stat } from './data/creation';
import { PROFESSIONS, type ProfessionDef } from './data/professions';
import { BASE_RATINGS, BONUS_PICKS, BONUS_POINTS, MAX_CREATION_SKILL, TYPED_SKILLS, baseRating, makeKey } from './data/skills';

// ---- Statistics (pp. 14, 18–19)
export const roll4d6dl = (rng = Math.random) => {
  const d = Array.from({ length: 4 }, () => 1 + Math.floor(rng() * 6)).sort((a, b) => a - b);
  return d[1] + d[2] + d[3];
};

// ---- Tests (p. 44): d% at or below the chance succeeds; 01 or matching dice on a success is critical; 00 or matching dice on a failure is a fumble.
export type Outcome = 'critical success' | 'success' | 'failure' | 'fumble';
export function testOutcome(roll: number, chance: number): Outcome {
  if (roll === 100) return 'fumble'; // fails whatever the chance
  const match = roll % 11 === 0;
  if (roll === 1 || (roll <= chance && match)) return 'critical success';
  if (roll <= chance) return 'success';
  return match ? 'fumble' : 'failure';
}
export const rollD100 = () => 1 + Math.floor(Math.random() * 100);

/** p. 47: 1–2 WP is −20% to everything; at 0 WP no test can succeed. `extra` is any other flat penalty. */
export const wpPenalty = (wp: number) => (wp > 0 && wp <= 2 ? 20 : 0);
export function liveOutcome(roll: number, chance: number, wp: number, extra = 0) {
  const pen = wpPenalty(wp) + extra;
  const eff = Math.max(0, chance - pen);
  const outcome: Outcome = wp > 0 ? testOutcome(roll, eff) : roll === 100 || roll % 11 === 0 ? 'fumble' : 'failure';
  return { chance: eff, pen, outcome };
}

const DICE = /^(\d+)(?:D(\d+))?(?:\+(\d+))?$/i;
/** "1D6", "1D6+2" or "3" → a total; null when it isn't dice notation. */
export function rollExpr(expr: string, rng = Math.random): number | null {
  const m = DICE.exec(expr.trim());
  if (!m || Number(m[1]) > 50 || Number(m[2] ?? 0) > 100) return null;
  let t = Number(m[3] ?? 0);
  if (m[2]) for (let i = 0; i < Number(m[1]); i++) t += 1 + Math.floor(rng() * Number(m[2]));
  else t += Number(m[1]);
  return t;
}
/** A SAN loss roll: extra victims ("1D6+2") add to the die but never past its maximum (p. 67 footnote). */
export function rollLoss(expr: string, rng = Math.random): number | null {
  const v = rollExpr(expr, rng), m = DICE.exec(expr.trim());
  return v !== null && m && m[2] && m[3] ? Math.min(v, Number(m[1]) * Number(m[2])) : v;
}
/** SAN loss as printed in the book, "success/failure": "0/1D4". */
export const parseLoss = (s: string) => {
  const p = s.split('/').map((x) => x.trim());
  return p.length === 2 && p.every((x) => rollExpr(x) !== null) ? ([p[0], p[1]] as const) : null;
};

export function featureOf(stat: Stat, score: number): string | null {
  if (score >= 9 && score <= 12) return null;
  const [a, b, c, d] = FEATURES[stat];
  return score <= 4 ? a : score <= 8 ? b : score <= 16 ? c : d;
}

export const veteranOf = (c: Character) => VETERANS.find((v) => v.id === c.veteran);
/** The disorder only counts while its veteran option is selected (imports can carry a stale one). */
export const disorderOf = (c: Character) => (c.veteran === 'unnatural' ? c.disorder.trim() : '');
export const professionOf = (c: Character) => PROFESSIONS.find((p) => p.id === c.professionId);

/** Derived attributes (p. 18) with Damaged Veteran adjustments (p. 38) applied. SAN starts at the pre-veteran POW × 5. */
export function derived(c: Character) {
  const v = veteranOf(c);
  const { STR, CON, POW, CHA } = c.stats;
  const pow = POW - (v?.pow ?? 0);
  const baseSan = POW * 5;
  const san = baseSan - (v ? (v.san === 'POW' ? pow : v.san) : 0);
  const unnatural = v?.unnatural ?? 0;
  return {
    hp: Math.ceil((STR + CON) / 2),
    wp: pow,
    pow,
    cha: CHA - (v?.cha ?? 0),
    san,
    bp: (unnatural ? san : baseSan) - pow, // p. 38: only Things Man Was Not Meant to Know resets BP to the reduced SAN
    maxSan: 99 - unnatural,
    bondScore: CHA - (v?.bonds ?? 0),
  };
}

// ---- Profession kits (pp. 20–26)
export interface Alt { family: string; type?: string; askType: boolean; rating: number }
export interface Slot { id: string; alts: Alt[] }

const ENTRY = /^([^*(]+?)(?:\(([^)]*)\))?(\*)?\s+(\d+)$/;
export function parseSlot(id: string, src: string): Slot {
  return {
    id,
    alts: src.split('|').map((s) => {
      const m = ENTRY.exec(s.trim());
      if (!m) throw new Error(`bad skill entry: ${s}`);
      return { family: m[1], type: m[2], askType: !!m[3], rating: Number(m[4]) };
    }),
  };
}

export function slotsOf(p: ProfessionDef) {
  return {
    fixed: p.fixed.map((s, i) => parseSlot(`f${i}`, s)),
    options: (p.choose?.from ?? []).map((s, i) => parseSlot(`c${i}`, s)),
    n: p.choose?.n ?? 0,
  };
}

export interface KitSkill { slot: string; key: string; rating: number; missingType: boolean }

function resolve(slot: Slot, c: Character): KitSkill {
  const alt = slot.alts[c.orPicks[slot.id] ?? 0] ?? slot.alts[0];
  const type = alt.type ?? (alt.askType ? c.types[slot.id]?.trim() : undefined);
  const missingType = alt.askType && !type;
  return { slot: slot.id, key: makeKey(alt.family, type), rating: alt.rating, missingType };
}

export function kitOf(c: Character): KitSkill[] {
  const p = professionOf(c);
  if (!p) return [];
  const { fixed, options } = slotsOf(p);
  return [...fixed, ...options.filter((o) => c.picks.includes(o.id))].map((s) => resolve(s, c));
}

/** p. 20: an optional skill must not duplicate one the Agent already has from the fixed kit. */
export const duplicatesKit = (c: Character, o: Slot) => {
  const owned = new Set(kitOf(c).filter((k) => k.slot.startsWith('f') && !k.missingType).map((k) => k.key));
  return o.alts.every((a) => !a.askType && owned.has(makeKey(a.family, a.type)));
};

// ---- Skills
export interface SkillLine { key: string; base: number; professional: number | null; bonus: number; veteran: number; total: number }

export function skillsOf(c: Character): SkillLine[] {
  const kit = new Map<string, number>();
  for (const k of kitOf(c)) if (!k.missingType) kit.set(k.key, Math.max(kit.get(k.key) ?? 0, k.rating));
  const bonus = new Map<string, number>();
  for (const k of c.bonus) if (k) bonus.set(k, (bonus.get(k) ?? 0) + BONUS_POINTS);
  const vet = new Map<string, number>();
  const v = veteranOf(c);
  if (v?.occult) vet.set('Occult', v.occult);
  if (v?.unnatural) vet.set('Unnatural', v.unnatural);
  if (v?.extraSkills) for (const k of c.veteranSkills.slice(0, v.extraSkills.count)) if (k) vet.set(k, (vet.get(k) ?? 0) + v.extraSkills.amount);

  const keys = new Set([...Object.keys(BASE_RATINGS).filter((k) => !TYPED_SKILLS.includes(k)), ...kit.keys(), ...bonus.keys(), ...vet.keys()]);
  return [...keys].sort().map((key) => {
    const professional = kit.get(key) ?? null;
    const base = baseRating(key);
    const b = bonus.get(key) ?? 0, vv = vet.get(key) ?? 0;
    return { key, base, professional, bonus: b, veteran: vv, total: Math.min(99, (professional ?? base) + b + vv) };
  });
}

/** Skill search: case-insensitive substring of the skill's full name, type included. */
export const filterSkills = (lines: SkillLine[], query: string) => {
  const q = query.trim().toLowerCase();
  return q ? lines.filter((s) => s.key.toLowerCase().includes(q)) : lines;
};

// ---- Validation
export type StepId = 'stats' | 'profession' | 'bonds' | 'details';
/** `warn` issues are advice (the Handler may allow them) and don't block the Live Sheet. */
export interface Issue { step: StepId; msg: string; warn?: boolean }
export const blocking = (issues: Issue[]) => issues.filter((i) => !i.warn);

export function bondCount(c: Character) {
  return Math.max(1, (professionOf(c)?.bonds ?? 0) - (veteranOf(c)?.removeBond ? 1 : 0));
}

export function validate(c: Character): Issue[] {
  const out: Issue[] = [];
  const add = (step: StepId, msg: string, warn?: boolean) => out.push({ step, msg, warn });
  const scores = STATS.map((s) => c.stats[s]);

  if (c.statMethod === 'points' && scores.reduce((a, b) => a + b, 0) !== POINT_BUY_TOTAL)
    add('stats', `Scores must total ${POINT_BUY_TOTAL} (now ${scores.reduce((a, b) => a + b, 0)}).`);
  if (c.statMethod === 'set') {
    const set = STAT_SETS.find((s) => s.id === c.statSet);
    if (!set) add('stats', 'Choose a stat set.');
    else if ([...scores].sort().join() !== [...set.values].sort().join()) add('stats', `Scores must be exactly ${set.values.join(', ')}.`);
  }

  const p = professionOf(c);
  if (!p) add('profession', 'Choose a profession.');
  else {
    const { options, n } = slotsOf(p);
    if (c.picks.filter((id) => options.some((o) => o.id === id)).length !== n) add('profession', `Choose exactly ${n} optional professional skill${n === 1 ? '' : 's'}.`);
    const kit = kitOf(c);
    if (kit.some((k) => k.missingType)) add('profession', 'Name the type for each typed skill (language, science, craft…).');
    const dupes = [...new Set(kit.map((k) => k.key).filter((k, i, a) => a.indexOf(k) !== i))];
    if (dupes.length) add('profession', `${dupes.join(', ')} appears twice in the professional skills — change one of the picks.`);
  }

  if (c.bonus.some((k) => !k)) add('profession', `Pick all ${BONUS_PICKS} bonus skills.`);
  if (c.bonus.includes('Unnatural')) add('profession', 'Unnatural cannot be a bonus skill.');
  if (c.bonus.some((k) => k && /^(Art|Craft|Foreign Language|Military Science|Pilot|Science)$/.test(k))) add('profession', 'Name the type for each typed bonus skill.');
  for (const s of skillsOf(c)) if (s.bonus && (s.professional ?? s.base) + s.bonus > MAX_CREATION_SKILL) add('profession', `${s.key} exceeds ${MAX_CREATION_SKILL}% before veteran adjustments (the Handler may allow it).`, true);

  const need = bondCount(c);
  const named = c.bonds.slice(0, need).filter((b) => b.name.trim()).length;
  if (p && named !== need) add('bonds', `Name ${need} bond${need === 1 ? '' : 's'} (${named} named).`);

  if (!c.details.name.trim()) add('details', 'Give the Agent a name.');
  const v = veteranOf(c);
  if (v?.id === 'unnatural' && !disorderOf(c)) add('details', `${v.name}: choose a new disorder.`);
  if (v?.extraSkills && c.veteranSkills.filter(Boolean).length !== v.extraSkills.count) add('details', `${v.name}: pick ${v.extraSkills.count} skills for +${v.extraSkills.amount}%.`);
  if (v?.extraSkills) {
    const { cap } = v.extraSkills;
    const picked = c.veteranSkills.filter(Boolean);
    if (new Set(picked).size !== picked.length) add('details', `${v.name}: pick ${v.extraSkills.count} different skills.`);
    for (const s of skillsOf(c)) if ((picked.includes(s.key) || s.key === 'Occult') && s.total > cap) add('details', `${s.key} exceeds ${cap}% — ${v.name} can't raise a skill past ${cap}%.`);
  }
  return out;
}
