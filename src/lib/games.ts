import { addDoc, collection, deleteDoc, doc, getDocs, limit, onSnapshot, orderBy, query, runTransaction, serverTimestamp, type DocumentData } from 'firebase/firestore';
import { useSub, type Sub } from './useSub';
import { agentLabel } from '../model/names';
import { db } from './firebase';
import { agentPath, agentsPath, gamePath, pendingSanPath, rollsPath } from './paths';
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

export const gameRef = (g: string) => doc(db, gamePath(g));
export const agentsCol = (g: string) => collection(db, agentsPath(g));
export const agentRef = (g: string, a: string) => doc(db, agentPath(g, a));
export const deleteAgent = (g: string, a: string) => deleteDoc(agentRef(g, a));
export const rollsCol = (g: string) => collection(db, rollsPath(g));

/** Rejects with Error('taken') when the ID is in use. */
export const createGame = (id: string) =>
  runTransaction(db, async (tx) => {
    if ((await tx.get(gameRef(id))).exists()) throw new Error('taken');
    tx.set(gameRef(id), { createdAt: Date.now(), schemaVersion: SCHEMA_VERSION });
  });

/**
 * The whole game as plain data, for a backup file: every Agent (sheet and live play) and the full roll log, oldest first.
 * shortcut: reads every roll, fine at table size; page it or leave the rolls out if logs grow past a few thousand.
 */
export async function exportGame(g: string) {
  const [agents, rolls] = await Promise.all([getDocs(agentsCol(g)), getDocs(query(rollsCol(g), orderBy('createdAt')))]);
  return {
    app: 'yourcodena.me', gameId: g, exportedAt: Date.now(),
    agents: agents.docs.map((d) => ({ id: d.id, ...d.data() })),
    rolls: rolls.docs.map((d) => toRoll(d.id, d.data({ serverTimestamps: 'estimate' }))),
  };
}

/** A roll-log entry (a d% test, or plain dice / HP lost from the Discord bot; see rules/outcome.ts). agentId is '' when no Agent was claimed. */
export type RollDoc = RollEntry & { id: string; agentId: string; createdAt: number };
/** The live sheet only logs d% tests; dice and damage entries come from the Discord bot. Server time, so devices with wrong clocks still log in order. */
export const logRoll = (g: string, r: Omit<TestEntry, 'kind'> & { agentId: string }) => addDoc(rollsCol(g), { ...r, createdAt: serverTimestamp() });

export interface AgentCard { id: string; /** What to call the agent: codename, else name. */ label: string; name: string; codename: string; profession: string; vitals: { hp: number; wp: number; san: number } | null; character: unknown; live: unknown }
const toAgent = (id: string, d: DocumentData): AgentCard => ({
  id, label: agentLabel(d.codename, d.name), name: d.name ?? '', codename: d.codename ?? '', profession: d.profession ?? '',
  vitals: d.live ? { hp: d.live.hp, wp: d.live.wp, san: d.live.san } : null,
  character: d.character, live: d.live, // raw: HandlerPanels parses them
});

// Older rolls hold a millisecond number, newer ones a Timestamp. Firestore sorts every number before every Timestamp, which is also oldest first.
const toRoll = (id: string, d: DocumentData) => ({ ...d, id, createdAt: typeof d.createdAt === 'number' ? d.createdAt : d.createdAt.toMillis() }) as RollDoc;

// Offline, a game this browser never opened is "missing" only because the cache is empty, so wait for the server's word on it.
const subGame: Sub<boolean> = (g, ok, bad) =>
  onSnapshot(gameRef(g), { includeMetadataChanges: true }, (s) => { if (s.exists() || !s.metadata.fromCache) ok(s.exists()); }, bad);
const subAgents: Sub<AgentCard[]> = (g, ok, bad) =>
  onSnapshot(query(agentsCol(g), orderBy('createdAt')), (s) => ok(s.docs.map((d) => toAgent(d.id, d.data()))), bad);
const subRolls: Sub<RollDoc[]> = (g, ok, bad) =>
  onSnapshot(query(rollsCol(g), orderBy('createdAt', 'desc'), limit(50)), (s) => ok(s.docs.map((d) => toRoll(d.id, d.data({ serverTimestamps: 'estimate' })))), bad);

/** A SAN loss the Discord bot is holding until its player chooses (project onto a Bond or take it). */
export interface HeldSan { amount: number; kind: string }
const subHeld: Sub<Record<string, HeldSan>> = (g, ok, bad) =>
  onSnapshot(collection(db, pendingSanPath(g)), (s) => ok(Object.fromEntries(s.docs.map((d) => [d.id, d.data() as HeldSan]))), bad);

/** data: whether the game exists. */
export const useGameExists = (g: string) => useSub(g, subGame);
export const useAgents = (g: string) => useSub(g, subAgents);
export const useRolls = (g: string) => useSub(g, subRolls);
/** data: held SAN losses by Agent ID. */
export const useHeldSan = (g: string) => useSub(g, subHeld);
