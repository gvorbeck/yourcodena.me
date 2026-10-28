import { z } from 'zod';
import { STATS } from '../rules/data/creation';
import { BONUS_PICKS } from '../rules/data/skills';
import { SAVED_AGENT_BAK, SAVED_AGENT_KEY, store } from '../lib/storage';
import { fromGreenAgent, isGreenAgent } from './greenagent';

export const CHARACTER_VERSION = 1;

// Limits keep an imported file or a pasted wall of text from outgrowing a Firestore document (1 MiB); the inputs enforce the same maxima.
export const MAX_LINE = 200, MAX_NAME = 100, MAX_PROSE = 5000; // MAX_NAME is also the cap in firestore.rules
const line = z.string().max(MAX_LINE).default('');
const name = z.string().max(MAX_NAME).default('');
const prose = z.string().max(MAX_PROSE).default('');
const skill = z.string().max(120); // "Family(Type)"; the type input stops at 100. Also the roll label cap in firestore.rules.
const stat = z.number().int().min(3).max(18);

/** "Building a New Profession" (Handbook p. 26): ten skills sharing a point budget; selected with professionId 'custom'. */
export const CUSTOM_SKILLS = 10;
const emptyCustom = () => ({ name: '', bonds: 3, skills: Array<string>(CUSTOM_SKILLS).fill(''), points: Array<number>(CUSTOM_SKILLS).fill(0) });

export const characterSchema = z.object({
  version: z.literal(CHARACTER_VERSION),
  stats: z.object(Object.fromEntries(STATS.map((s) => [s, stat])) as Record<(typeof STATS)[number], typeof stat>),
  statMethod: z.enum(['roll', 'points', 'set']).default('roll'),
  statSet: line,
  professionId: line,
  custom: z.object({
    name, bonds: z.number().int().min(1).max(4),
    skills: z.array(skill).length(CUSTOM_SKILLS), points: z.array(z.number().int().min(0).max(100)).length(CUSTOM_SKILLS),
  }).default(emptyCustom),
  orPicks: z.record(z.string(), z.number().int()).default(() => ({})),
  picks: z.array(z.string().max(20)).max(30).default(() => []),
  types: z.record(z.string(), z.string().max(100)).default(() => ({})),
  bonusPackage: line,
  bonus: z.array(skill).length(BONUS_PICKS),
  // Handler-approved per-skill fudge, added to the total. Capped like the other lists; Unnatural stays out because it sets max SAN.
  adjust: z.record(skill, z.number().int().min(-99).max(99)).refine((r) => Object.keys(r).length <= 30 && !('Unnatural' in r)).default(() => ({})),
  bonds: z.array(z.object({ name: line, note: line })).max(20).default(() => []),
  veteran: line,
  veteranSkills: z.array(skill).max(10).default(() => []),
  disorder: line,
  motivations: z.array(z.string().max(200)).max(5).default(() => []),
  details: z.object({
    name, codename: name, age: line, sex: line, nationality: line, employer: line, rank: line,
    education: prose, appearance: prose, personality: prose, admires: prose, dislikes: prose,
    trust: prose, helps: prose,
  }),
});

export type Character = z.infer<typeof characterSchema>;

/** A blank Agent: every field the schema doesn't default is given here. */
export const newCharacter = (): Character => characterSchema.parse({
  version: CHARACTER_VERSION, stats: Object.fromEntries(STATS.map((s) => [s, 10])), bonus: Array(BONUS_PICKS).fill(''), details: {},
});

export type DetailKey = keyof Character['details'];
/** The personal-detail fields in form order, with their labels and length caps (prose fields are text areas). */
export const DETAIL_FIELDS: { key: DetailKey; label: string; max: number; prose?: true }[] = [
  { key: 'name', label: 'Name', max: MAX_NAME }, { key: 'codename', label: 'Codename (optional)', max: MAX_NAME },
  { key: 'age', label: 'Age / date of birth', max: MAX_LINE }, { key: 'sex', label: 'Sex', max: MAX_LINE },
  { key: 'nationality', label: 'Nationality', max: MAX_LINE }, { key: 'employer', label: 'Employer', max: MAX_LINE },
  { key: 'rank', label: 'Profession / rank', max: MAX_LINE },
  { key: 'education', label: 'Education and occupational history', max: MAX_PROSE, prose: true }, { key: 'appearance', label: 'Physical description', max: MAX_PROSE, prose: true },
  { key: 'personality', label: 'Personality', max: MAX_PROSE, prose: true }, { key: 'admires', label: 'Something admired', max: MAX_PROSE, prose: true },
  { key: 'dislikes', label: 'Something disliked', max: MAX_PROSE, prose: true }, { key: 'trust', label: 'Why Delta Green trusts this Agent', max: MAX_PROSE, prose: true },
  { key: 'helps', label: 'Why this Agent helps Delta Green', max: MAX_PROSE, prose: true },
];
/** The Agent's name for headings, or `fallback` when blank. */
export const nameOf = (c: Character, fallback = 'Unnamed agent') => c.details.name.trim() || fallback;

/** Bump CHARACTER_VERSION and add a step here when the schema changes shape. */
type Raw = { version?: unknown };
const migrations: Record<number, (c: Raw) => Raw> = {};

export function parseCharacter(raw: unknown): Character {
  let c = raw as Raw | null;
  while (c && typeof c.version === 'number' && c.version < CHARACTER_VERSION) c = migrations[c.version](c);
  return characterSchema.parse(c);
}

export const loadCharacter = (): Character => {
  const s = store.get(SAVED_AGENT_KEY);
  if (s) {
    try { return parseCharacter(JSON.parse(s)); } catch { store.set(SAVED_AGENT_BAK, s); } // unreadable: keep the raw copy
  }
  return newCharacter();
};

export const exportJson = (c: Character) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(c, null, 2)], { type: 'application/json' }));
  a.download = `${c.details.name.trim().replace(/\W+/g, '-').toLowerCase() || 'agent'}.dg.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

export const importJson = async (file: File): Promise<Character> => {
  const raw = JSON.parse(await file.text());
  return parseCharacter(isGreenAgent(raw) ? fromGreenAgent(raw) : raw);
};
