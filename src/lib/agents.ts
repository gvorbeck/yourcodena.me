import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { newCharacter, parseCharacter, type Character } from '../model/character';
import { parseLive, type Live } from '../model/live';
import { professionOf } from '../rules';
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

export const saveCharacter = (g: string, a: string, c: Character) => updateDoc(agentRef(g, a), { ...summary(c), character: c, updatedAt: Date.now() });
export const saveLive = (g: string, a: string, live: Live) => updateDoc(agentRef(g, a), { live, updatedAt: Date.now() });

/** One read, not a subscription: the open page is the source of truth while editing, so a snapshot echo can't clobber typing. */
export const loadAgent = async (g: string, a: string): Promise<{ c: Character; live: Live | null } | null> => {
  const snap = await getDoc(agentRef(g, a));
  if (!snap.exists()) return null;
  const d = snap.data();
  return { c: parseCharacter(d.character), live: d.live ? parseLive(d.live) : null };
};
