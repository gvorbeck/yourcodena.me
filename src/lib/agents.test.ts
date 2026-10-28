// What the browser writes, checked against firestore.rules, and how saves are diffed. Firestore itself is faked.
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { newCharacter } from '../model/character';
import { freshLive, type Live } from '../model/live';

type Pairs = Record<string, unknown>;
const writes: { set: Pairs[]; add: Pairs[]; tx: Pairs[]; updates: Pairs[][] } = { set: [], add: [], tx: [], updates: [] };
let commit = async () => {};

vi.mock('./firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => {
  class FieldPath { segments: string[]; constructor(...s: string[]) { this.segments = s; } }
  const key = (f: unknown) => (f instanceof FieldPath ? f.segments.join('.') : String(f));
  return {
    FieldPath,
    arrayUnion: (...v: unknown[]) => ({ union: v }),
    arrayRemove: (...v: unknown[]) => ({ remove: v }),
    deleteField: () => ({ deleted: true }),
    collection: (_db: unknown, path: string) => ({ path }),
    doc: (parent: { path?: string }, path?: string) => ({ id: 'new', path: path ?? `${parent.path}/new` }),
    setDoc: async (_ref: unknown, v: Pairs) => { writes.set.push(v); },
    addDoc: async (_ref: unknown, v: Pairs) => { writes.add.push(v); },
    runTransaction: async (_db: unknown, fn: (tx: unknown) => Promise<void>) =>
      fn({ get: async () => ({ exists: () => false }), set: (_ref: unknown, v: Pairs) => { writes.tx.push(v); } }),
    writeBatch: () => {
      const batch: Pairs[] = [];
      return {
        update: (_ref: unknown, ...args: unknown[]) => {
          const p: Pairs = {};
          for (let i = 0; i < args.length; i += 2) p[key(args[i])] = args[i + 1];
          batch.push(p);
        },
        commit: async () => { await commit(); writes.updates.push(batch); },
      };
    },
  };
});

const { createAgent, saveCharacter, saveLive } = await import('./agents');
const { createGame, logRoll } = await import('./games');

/** The hasOnly list of the first match block whose path starts with `path`. */
const RULES = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
const allowed = (path: string) => {
  const at = RULES.indexOf(`match /${path}`);
  const list = at < 0 ? null : /hasOnly\((\[[^\]]*\])\)/.exec(RULES.slice(at));
  if (!list) throw new Error(`firestore.rules has no hasOnly list under "match /${path}"; update this test if it moved`);
  return JSON.parse(list[1].replace(/'/g, '"')) as string[];
};
const fieldsOf = (p: Pairs) => [...new Set(Object.keys(p).map((k) => k.split('.')[0]))];

beforeEach(() => {
  writes.set = []; writes.add = []; writes.tx = []; writes.updates = [];
  commit = async () => {};
});

describe('writes stay inside firestore.rules', () => {
  it('game, agent and roll documents only use fields their hasOnly lists allow', async () => {
    await createGame('kestrel-lantern-abc123');
    createAgent('g');
    await saveCharacter('g', 'rules', newCharacter());
    await saveLive('g', 'rules', freshLive(newCharacter()));
    await logRoll('g', { agentId: 'a', agentName: 'Drew', label: 'Firearms', chance: 45, penalty: 0, roll: 12, outcome: 'success' });

    expect(allowed('games/{gameId}')).toEqual(expect.arrayContaining(fieldsOf(writes.tx[0])));
    for (const p of [writes.set[0], ...writes.updates.flat()]) expect(allowed('agents/{agentId}')).toEqual(expect.arrayContaining(fieldsOf(p)));
    expect(allowed('rolls/{rollId}')).toEqual(expect.arrayContaining(fieldsOf(writes.add[0])));
  });

  it('a sheet stays under the rules caps of 30 keys in character and live', () => {
    const c = newCharacter();
    expect(Object.keys(c).length).toBeLessThanOrEqual(30);
    expect(Object.keys(freshLive(c)).length).toBeLessThanOrEqual(30);
  });
});

describe('saveLive sends only what changed', () => {
  const live = (over: Partial<Live> = {}): Live => ({ ...freshLive(newCharacter()), ...over });

  it('the first save sends the whole sheet, later ones only the changed leaves', async () => {
    await saveLive('g', 'a1', live());
    expect(Object.keys(writes.updates[0][0])).toEqual(['live', 'updatedAt']);
    await saveLive('g', 'a1', live({ hp: 3 }));
    expect(writes.updates[1]).toEqual([{ 'live.hp': 3, updatedAt: expect.any(Number) }]);
  });

  it("checked skills go as additions and removals, so the bot's own checks survive", async () => {
    await saveLive('g', 'a2', live({ checked: ['Alertness', 'Firearms'] }));
    await saveLive('g', 'a2', live({ checked: ['Firearms', 'Search'] }));
    expect(writes.updates[1]).toEqual([
      { 'live.checked': { remove: ['Alertness'] } }, // its own write first: union and remove can't share one
      { 'live.checked': { union: ['Search'] }, updatedAt: expect.any(Number) },
    ]);
  });

  it('a failed save is sent again with the next one', async () => {
    await saveLive('g', 'a3', live());
    commit = async () => { throw new Error('offline'); };
    await expect(saveLive('g', 'a3', live({ hp: 3 }))).rejects.toThrow('offline');
    commit = async () => {};
    await saveLive('g', 'a3', live({ hp: 3, wp: 4 }));
    expect(writes.updates.at(-1)).toEqual([{ 'live.hp': 3, 'live.wp': 4, updatedAt: expect.any(Number) }]);
  });
});
