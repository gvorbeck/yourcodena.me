import { PROFESSIONS } from '../rules/data/professions';
import { BASE_RATINGS, BONUS_PICKS, makeKey } from '../rules/data/skills';
import { CUSTOM_SKILLS, DETAIL_FIELDS, MAX_LINE, MAX_NAME, newCharacter, type Character } from './character';
import { clamp } from '../rules';
import { slotsOf } from '../rules';

// Importer for the JSON exported by greenagentcreator.github.io/charactercreator.
const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
const FAMILY = new Map(Object.keys(BASE_RATINGS).map((f) => [norm(f), f]));
const PROFESSION_IDS: Record<string, string> = {
  anthropologist_archaeologist_historian: 'anthropologist', computer_scientist_engineer: 'computer-scientist',
  federal_agent: 'federal-agent', physician: 'physician', scientist: 'scientist', special_operator: 'special-operator',
};

interface GSkill { key: string; typeName?: string | null; points?: number; increases?: number }
interface GAgent {
  professionKey: string; skills: GSkill[]; stats?: Partial<Character['stats']>; personalInfo?: Record<string, unknown>;
  bonds?: { description?: string }[]; motivations?: unknown[]; isCustomProfession?: boolean; customProfessionName?: string;
  customProfessionBonds?: number; customProfessionSelectedSkills?: GSkill[];
  orSkillChoices?: Record<string, string>; profChoiceSkillSelections?: Record<string, boolean>;
}

export const isGreenAgent = (r: unknown): r is GAgent =>
  !!r && typeof r === 'object' && 'professionKey' in r && Array.isArray((r as GAgent).skills);

const skillKey = (s: GSkill) => {
  const family = FAMILY.get(norm(s.key));
  return family ? makeKey(family, s.typeName?.trim()) : '';
};

export function fromGreenAgent(r: GAgent): Character {
  const c = newCharacter();
  const info = r.personalInfo ?? {};
  Object.assign(c.stats, r.stats);
  Object.assign(c.details, { name: info.name, age: String(info.age ?? ''), sex: info.sex, nationality: info.nationality, employer: info.employer });
  for (const { key, max } of DETAIL_FIELDS) c.details[key] = String(c.details[key] ?? '').slice(0, max);
  c.bonds = (r.bonds ?? []).slice(0, 20).map((b) => ({ name: String(b.description ?? '').slice(0, MAX_LINE), note: '' }));
  c.motivations = (r.motivations ?? []).slice(0, 5).map((m: unknown) => String(m).slice(0, MAX_LINE));

  // Each skill increase is +20, which is one of our eight bonus picks.
  const picks = r.skills.flatMap((s) => Array<string>(s.increases ?? 0).fill(skillKey(s))).filter(Boolean);
  c.bonus = Array.from({ length: BONUS_PICKS }, (_, i) => picks[i] ?? '');

  if (r.isCustomProfession) {
    c.professionId = 'custom';
    const chosen = (r.customProfessionSelectedSkills ?? []).map((s) => ({ key: skillKey(s), points: s.points ?? 0 })).filter((s) => s.key);
    c.custom = {
      name: String(r.customProfessionName ?? '').slice(0, MAX_NAME),
      bonds: clamp(r.customProfessionBonds ?? 3, 1, 4),
      skills: Array.from({ length: CUSTOM_SKILLS }, (_, i) => chosen[i]?.key ?? ''),
      points: Array.from({ length: CUSTOM_SKILLS }, (_, i) => Math.min(100, chosen[i]?.points ?? 0)),
    };
    // Our custom kits hold ten skills; extras survive as Handler adjustments so totals still match.
    for (const s of chosen.slice(CUSTOM_SKILLS)) c.adjust[s.key] = Math.min(99, s.points);
  } else {
    // shortcut: choices are matched by skill family only; typed skills (languages, sciences) come in untyped, so the Agent must name them.
    const def = PROFESSIONS.find((p) => p.id === PROFESSION_IDS[r.professionKey]);
    if (def) {
      c.professionId = def.id;
      const { fixed, options } = slotsOf(def);
      for (const key of Object.values(r.orSkillChoices ?? {})) {
        const slot = fixed.find((s) => s.alts.some((a) => norm(a.family) === norm(key)));
        const i = slot?.alts.findIndex((a) => norm(a.family) === norm(key)) ?? -1;
        if (slot && i >= 0) c.orPicks[slot.id] = i;
      }
      for (const [key, on] of Object.entries(r.profChoiceSkillSelections ?? {})) {
        const o = on && options.find((s) => !c.picks.includes(s.id) && s.alts.some((a) => norm(a.family) === norm(key.replace(/_choice.*$/, ''))));
        if (o) c.picks.push(o.id);
      }
    }
  }
  return c;
}
