import { FieldPath, arrayRemove, arrayUnion, deleteField, doc, getDoc, onSnapshot, setDoc, writeBatch, type Unsubscribe } from 'firebase/firestore';
import { newCharacter, parseCharacter, type Character } from '../model/character';
import { parseLive, type Live } from '../model/live';
import { professionOf } from '../rules';
import { REMOVED, diffPaths, setDelta } from './diff';
import { db } from './firebase';
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

// Arrays that other writers also add to (the Discord bot checks failed skills): saved as additions and removals, not replaced.
const SETS = ['live.checked'];
const at = (v: unknown, path: string[]) => path.reduce<unknown>((o, k) => (o as Record<string, unknown> | null)?.[k], v);
type Pairs = (string | FieldPath | unknown)[];

function saveField(g: string, a: string, field: 'character' | 'live', value: unknown, extra: Record<string, unknown> = {}) {
  const k = slot(g, a, field);
  const before = known.has(k) ? known.get(k) : undefined;
  const leaves = before === undefined ? [[[], value] as [string[], unknown]] : diffPaths(before, value);
  const main: Pairs = [], removals: Pairs = [];
  for (const [path, v] of leaves) {
    const fp = new FieldPath(field, ...path);
    if (v !== REMOVED && SETS.includes([field, ...path].join('.'))) {
      // Union and remove can't touch one field in one update, so removals go in a second write of the same batch.
      const { add, remove } = setDelta(at(before, path), v);
      if (add.length) main.push(fp, arrayUnion(...add));
      if (remove.length) removals.push(fp, arrayRemove(...remove));
    } else main.push(fp, v === REMOVED ? deleteField() : v);
  }
  const batch = writeBatch(db);
  const update = (p: Pairs) => { const [f, v, ...rest] = p as [string | FieldPath, unknown, ...unknown[]]; batch.update(agentRef(g, a), f, v, ...rest); };
  if (removals.length) update(removals);
  update([...main, 'updatedAt', Date.now(), ...Object.entries(extra).flat()]);
  return batch.commit().then(() => { known.set(k, value); });
}

/**
 * Calls `onRemote(remote, base)` whenever the agent's `live` on the server differs from what this tab last read or
 * wrote: someone else saved it (Discord damage, a skill checked from Discord, another device). The caller merges.
 * Own writes still in flight are skipped; their echo merges harmlessly because those leaves are local changes too.
 */
export function watchLive(g: string, a: string, onRemote: (remote: Live, base: Live) => void): Unsubscribe {
  const k = slot(g, a, 'live');
  return onSnapshot(agentRef(g, a), (snap) => {
    const base = known.get(k) as Live | null | undefined;
    if (snap.metadata.hasPendingWrites || !snap.exists() || !base) return; // no base yet: nothing to merge against
    let remote: Live;
    try { remote = parseLive(snap.get('live')); } catch { return; } // missing or unreadable: keep what's on screen
    if (JSON.stringify(remote) === JSON.stringify(base)) return;
    known.set(k, remote);
    onRemote(remote, base);
  }, () => {}); // offline or denied: the page keeps working from its own state
}

export const saveCharacter = (g: string, a: string, c: Character) => saveField(g, a, 'character', c, summary(c));
export const saveLive = (g: string, a: string, live: Live) => saveField(g, a, 'live', live);

/** The stored agent doesn't match the sheet's shape, so reloading won't help. */
export class DamagedAgent extends Error {}

/** One read, not a subscription: the open page is the source of truth while editing, so a snapshot echo can't clobber typing. */
export const loadAgent = async (g: string, a: string): Promise<{ c: Character; live: Live | null } | null> => {
  const snap = await getDoc(agentRef(g, a));
  if (!snap.exists()) return null;
  const d = snap.data();
  let c: Character, live: Live | null;
  try { c = parseCharacter(d.character); live = d.live ? parseLive(d.live) : null; } catch { throw new DamagedAgent(); }
  known.set(slot(g, a, 'character'), c);
  known.set(slot(g, a, 'live'), live);
  return { c, live };
};
