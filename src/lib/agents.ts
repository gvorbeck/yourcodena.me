import { FieldPath, deleteField, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { newCharacter, parseCharacter, type Character } from '../model/character';
import { parseLive, type Live } from '../model/live';
import { professionOf } from '../rules';
import { REMOVED, diffPaths } from './diff';
import { agentRef, agentsCol } from './games';

// Kept apart from games.ts so the game page only loads the sheet model (and its rules) when an agent is created or opened.

/** Denormalized for the game page's list, so it never has to parse a whole sheet. */
const summary = (c: Character) => ({ name: c.details.name.trim(), codename: c.details.codename.trim(), profession: professionOf(c)?.name ?? '' });

// shortcut: the write is not awaited (the promise only settles once the server acknowledges it, which never happens offline). The agent page
// reads it back from the local cache; a write the rules reject shows up there as "no such agent". Add a toast if that proves confusing.
export const createAgent = (g: string, c: Character = newCharacter()) => {
  const ref = doc(agentsCol(g));
  const now = Date.now();
  setDoc(ref, { ...summary(c), character: c, live: null, createdAt: now, updatedAt: now }).catch(console.error);
  return ref.id;
};

/**
 * What this tab last read or wrote, per agent field. Saves send only the leaves that differ from it, so a second
 * device changing other fields isn't overwritten (the same field still goes to whoever writes last). It moves
 * forward only once a write is acknowledged, so a failed or still-queued write is included in the next diff.
 */
const known = new Map<string, unknown>();
const slot = (g: string, a: string, field: string) => `${g}/${a}/${field}`;

function saveField(g: string, a: string, field: 'character' | 'live', value: unknown, extra: Record<string, unknown> = {}) {
  const k = slot(g, a, field);
  const before = known.has(k) ? known.get(k) : undefined;
  const leaves = before === undefined ? [[[], value] as [string[], unknown]] : diffPaths(before, value);
  const flat = leaves.flatMap(([path, v]) => [new FieldPath(field, ...path), v === REMOVED ? deleteField() : v]);
  const [first, ...rest] = [...flat, 'updatedAt', Date.now(), ...Object.entries(extra).flat()] as [string | FieldPath, unknown, ...unknown[]];
  return updateDoc(agentRef(g, a), first, rest[0], ...rest.slice(1)).then(() => { known.set(k, value); });
}

export const saveCharacter = (g: string, a: string, c: Character) => saveField(g, a, 'character', c, summary(c));
export const saveLive = (g: string, a: string, live: Live) => saveField(g, a, 'live', live);

/** One read, not a subscription: the open page is the source of truth while editing, so a snapshot echo can't clobber typing. */
export const loadAgent = async (g: string, a: string): Promise<{ c: Character; live: Live | null } | null> => {
  const snap = await getDoc(agentRef(g, a));
  if (!snap.exists()) return null;
  const d = snap.data();
  const c = parseCharacter(d.character), live = d.live ? parseLive(d.live) : null;
  known.set(slot(g, a, 'character'), c);
  known.set(slot(g, a, 'live'), live);
  return { c, live };
};
