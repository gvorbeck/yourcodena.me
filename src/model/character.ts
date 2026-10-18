import { z } from 'zod';
import { STATS } from '../rules/data/creation';
import { SAVED_AGENT_KEY as KEY } from '../lib/storageKeys';

export const CHARACTER_VERSION = 1;

// Limits keep an imported file or a pasted wall of text from outgrowing a Firestore document (1 MiB); the inputs enforce the same maxima.
const line = z.string().max(200).default('');
const name = z.string().max(100).default(''); // also the cap in firestore.rules
const prose = z.string().max(5000).default('');
const skill = z.string().max(120); // "Family(Type)"; the type input stops at 100
const stat = z.number().int().min(3).max(18);

export const characterSchema = z.object({
  version: z.literal(CHARACTER_VERSION),
  stats: z.object(Object.fromEntries(STATS.map((s) => [s, stat])) as Record<(typeof STATS)[number], typeof stat>),
  statMethod: z.enum(['roll', 'points', 'set']).default('roll'),
  statSet: line,
  professionId: line,
  orPicks: z.record(z.number().int()).default({}),
  picks: z.array(z.string().max(20)).max(30).default([]),
  types: z.record(z.string().max(100)).default({}),
  bonusPackage: line,
  bonus: z.array(skill).length(8),
  bonds: z.array(z.object({ name: line, note: line })).max(20).default([]),
  veteran: line,
  veteranSkills: z.array(skill).max(10).default([]),
  disorder: line,
  motivations: z.array(z.string().max(200)).max(5).default([]),
  details: z.object({
    name, codename: name, age: line, sex: line, nationality: line, employer: line, rank: line,
    education: prose, appearance: prose, personality: prose, admires: prose, dislikes: prose,
    trust: prose, helps: prose,
  }),
});

export type Character = z.infer<typeof characterSchema>;

export const newCharacter = (): Character => ({
  version: CHARACTER_VERSION,
  stats: { STR: 10, DEX: 10, CON: 10, INT: 10, POW: 10, CHA: 10 },
  statMethod: 'roll', statSet: '', professionId: '', orPicks: {}, picks: [], types: {},
  bonusPackage: '', bonus: Array(8).fill(''), bonds: [], veteran: '', veteranSkills: [], disorder: '', motivations: [],
  details: { name: '', codename: '', age: '', sex: '', nationality: '', employer: '', rank: '', education: '', appearance: '', personality: '', admires: '', dislikes: '', trust: '', helps: '' },
});

/** Bump CHARACTER_VERSION and add a step here when the schema changes shape. */
type Raw = { version?: unknown };
const migrations: Record<number, (c: Raw) => Raw> = {};

export function parseCharacter(raw: unknown): Character {
  let c = raw as Raw | null;
  while (c && typeof c.version === 'number' && c.version < CHARACTER_VERSION) c = migrations[c.version](c);
  return characterSchema.parse(c);
}

export const loadCharacter = (): Character => {
  let s: string | null = null;
  try {
    s = localStorage.getItem(KEY);
    if (s) return parseCharacter(JSON.parse(s));
  } catch {
    // Unreadable save: keep the raw copy so the autosave of a blank Agent doesn't destroy it.
    try { if (s) localStorage.setItem(`${KEY}.bak`, s); } catch { /* storage blocked */ }
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

export const importJson = async (file: File): Promise<Character> => parseCharacter(JSON.parse(await file.text()));
