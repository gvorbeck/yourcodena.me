import { z } from 'zod';
import { STATS } from '../rules/data/creation';

export const CHARACTER_VERSION = 1;

const text = z.string().default('');
const stat = z.number().int().min(3).max(18);

export const characterSchema = z.object({
  version: z.literal(CHARACTER_VERSION),
  stats: z.object(Object.fromEntries(STATS.map((s) => [s, stat])) as Record<(typeof STATS)[number], typeof stat>),
  statMethod: z.enum(['roll', 'points', 'set']).default('roll'),
  statSet: text,
  professionId: text,
  orPicks: z.record(z.number().int()).default({}),
  picks: z.array(z.string()).default([]),
  types: z.record(z.string()).default({}),
  bonusPackage: text,
  bonus: z.array(z.string()).length(8),
  bonds: z.array(z.object({ name: text, note: text })).default([]),
  veteran: text,
  veteranSkills: z.array(z.string()).default([]),
  disorder: text,
  motivations: z.array(z.string()).max(5).default([]),
  details: z.object({
    name: text, codename: text, age: text, sex: text, nationality: text, employer: text, rank: text,
    education: text, appearance: text, personality: text, admires: text, dislikes: text,
    trust: text, helps: text,
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
const migrations: Record<number, (c: any) => any> = {};

export function parseCharacter(raw: unknown): Character {
  let c: any = raw;
  while (c && typeof c.version === 'number' && c.version < CHARACTER_VERSION) c = migrations[c.version](c);
  return characterSchema.parse(c);
}

import { SAVED_AGENT_KEY as KEY } from '../lib/storageKeys';
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
