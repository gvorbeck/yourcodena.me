import { addDoc, collection, deleteDoc, doc, limit, onSnapshot, orderBy, query, runTransaction, type DocumentData, type Unsubscribe } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from './firebase';
import type { RollEntry, TestEntry } from '../rules/outcome';

/*
 * Firestore layout (rules in firestore.rules):
 *   games/{gameId}                  { createdAt, schemaVersion }       immutable
 *   games/{gameId}/agents/{agentId} { name, codename, profession,      summary fields for the game page
 *                                     character, live | null,          the sheet itself (model/character, model/live)
 *                                     createdAt, updatedAt }
 *   games/{gameId}/rolls/{rollId}   { agentId, agentName, label, chance, penalty, roll, outcome, createdAt }   append-only
 * Anything new at game level (NPCs, session notes) becomes another sibling subcollection.
 */
export const SCHEMA_VERSION = 1;

export const gameRef = (g: string) => doc(db, 'games', g);
export const agentsCol = (g: string) => collection(db, 'games', g, 'agents');
export const agentRef = (g: string, a: string) => doc(db, 'games', g, 'agents', a);
export const deleteAgent = (g: string, a: string) => deleteDoc(agentRef(g, a));
export const rollsCol = (g: string) => collection(db, 'games', g, 'rolls');

/** Rejects with Error('taken') when the ID is in use. */
export const createGame = (id: string) =>
  runTransaction(db, async (tx) => {
    if ((await tx.get(gameRef(id))).exists()) throw new Error('taken');
    tx.set(gameRef(id), { createdAt: Date.now(), schemaVersion: SCHEMA_VERSION });
  });

/** A roll-log entry (a d% test, or plain dice / HP lost from the Discord bot; see rules/outcome.ts). agentId is '' when no Agent was claimed. */
export type RollDoc = RollEntry & { id: string; agentId: string; createdAt: number };
// shortcut: client clock, so rolls from different devices can order a few seconds off; use serverTimestamp if that matters.
/** The live sheet only logs d% tests; dice and damage entries come from the Discord bot. */
export const logRoll = (g: string, r: Omit<TestEntry, 'kind'> & { agentId: string }) => addDoc(rollsCol(g), { ...r, createdAt: Date.now() });

export interface AgentCard { id: string; name: string; codename: string; profession: string; vitals: { hp: number; wp: number; san: number } | null }
const toAgent = (id: string, d: DocumentData): AgentCard => ({
  id, name: d.name ?? '', codename: d.codename ?? '', profession: d.profession ?? '',
  vitals: d.live ? { hp: d.live.hp, wp: d.live.wp, san: d.live.san } : null,
});

type Sub<T> = (id: string, ok: (v: T) => void, bad: (e: Error) => void) => Unsubscribe;

/** Live subscription keyed by game ID. Data from a previous ID is never shown; `data` is undefined until the first snapshot. */
function useSub<T>(id: string, sub: Sub<T>): { data?: T; error?: Error } {
  const [s, setS] = useState<{ id: string; data?: T; error?: Error }>({ id });
  useEffect(() => sub(id, (data) => setS({ id, data }), (error) => setS({ id, error })), [id, sub]);
  return s.id === id ? s : {};
}

const subGame: Sub<boolean> = (g, ok, bad) => onSnapshot(gameRef(g), (s) => ok(s.exists()), bad);
const subAgents: Sub<AgentCard[]> = (g, ok, bad) =>
  onSnapshot(query(agentsCol(g), orderBy('createdAt')), (s) => ok(s.docs.map((d) => toAgent(d.id, d.data()))), bad);
const subRolls: Sub<RollDoc[]> = (g, ok, bad) =>
  onSnapshot(query(rollsCol(g), orderBy('createdAt', 'desc'), limit(50)), (s) => ok(s.docs.map((d) => ({ ...d.data(), id: d.id }) as RollDoc)), bad);

/** data: whether the game exists. */
export const useGameExists = (g: string) => useSub(g, subGame);
export const useAgents = (g: string) => useSub(g, subAgents);
export const useRolls = (g: string) => useSub(g, subRolls);
