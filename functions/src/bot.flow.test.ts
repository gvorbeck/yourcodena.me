// The /dg san projection buttons end to end, against a small in-memory stand-in for Firestore.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { newCharacter } from '../../src/model/character';
import { freshLive } from '../../src/model/live';

const store = new Map<string, Record<string, unknown>>();
const DELETE = Symbol('delete');
let ids = 0;

vi.mock('node:crypto', async (orig) => ({ ...(await orig<typeof import('node:crypto')>()), randomInt: () => 3 })); // every 1D4 is a 3

vi.mock('firebase-admin/firestore', () => {
  class FieldPath { segments: string[]; constructor(...s: string[]) { this.segments = s; } }
  const setPath = (o: Record<string, unknown>, path: string[], v: unknown) => {
    const last = path.at(-1)!, parent = path.slice(0, -1).reduce<Record<string, unknown>>((x, k) => (x[k] ??= {}) as Record<string, unknown>, o);
    if (v === DELETE) delete parent[last]; else parent[last] = v;
  };
  const snap = (path: string) => {
    const d = store.get(path);
    return { exists: d !== undefined, data: () => d && structuredClone(d), get: (k: string) => d?.[k] };
  };
  const ref = (path: string) => ({
    path,
    get: async () => snap(path),
    set: async (v: Record<string, unknown>) => { store.set(path, structuredClone(v)); },
    delete: async () => { store.delete(path); },
    update: async (...args: unknown[]) => {
      const d = store.get(path)!;
      if (args.length === 1) Object.assign(d, args[0]);
      else for (let i = 0; i < args.length; i += 2) setPath(d, args[i] instanceof FieldPath ? args[i].segments : String(args[i]).split('.'), args[i + 1]);
    },
  });
  type Ref = ReturnType<typeof ref>;
  const db = {
    doc: ref,
    collection: (p: string) => ({ doc: () => ref(`${p}/id${++ids}`), add: async (v: Record<string, unknown>) => ref(`${p}/id${++ids}`).set(v) }),
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn({
      get: (r: Ref) => r.get(), update: (r: Ref, ...a: unknown[]) => r.update(...a),
      create: (r: Ref, v: Record<string, unknown>) => r.set(v), delete: (r: Ref) => r.delete(),
    }),
  };
  return { FieldPath, FieldValue: { delete: () => DELETE, arrayUnion: () => undefined }, getFirestore: () => db };
});

const { clearCaches, handle } = await import('./bot');

const DANIEL = '111', KYLE = '222';
const press = (custom_id: string, user = DANIEL, permissions = '0') =>
  handle({ type: 3, data: { custom_id }, guild_id: 'G', channel_id: 'C', member: { user: { id: user }, permissions } }) as Promise<{ type: number; data: { content: string; flags?: number; components?: { components: { custom_id: string }[] }[] } }>;
const live = () => store.get('games/g/agents/A1')!.live as { san: number; wp: number; bonds: number[] };
const rolls = () => [...store.entries()].filter(([k]) => k.startsWith('games/g/rolls/')).map(([, v]) => v);

beforeEach(() => {
  store.clear();
  clearCaches();
  const c = newCharacter();
  c.details.codename = 'Drew Rook';
  c.bonds = [{ name: 'Mom', note: '' }];
  store.set('games/g/agents/A1', { codename: 'Drew Rook', name: '', character: c, live: freshLive(c) }); // SAN 50, WP 10, Mom 10
  store.set('gameSecrets/g', { webhookUrl: 'https://discord.com/api/webhooks/1/x' });
  store.set('discordClaims/g_111', { agentId: 'A1' });
  store.set('discordPending/A1', { kind: 'violence', expr: '1/1D8', amount: 6, note: '', gameId: 'g', agentId: 'A1', userId: DANIEL, testLine: '', createdAt: 0 });
});

describe('/dg san projection buttons', () => {
  it('Take the loss applies it, logs it, and clears the hold', async () => {
    const r = await press('san:take:A1');
    expect(r.type).toBe(7);
    expect(r.data.content).toContain('loses **6** SAN (violence)');
    expect(live().san).toBe(44);
    expect(store.has('discordPending/A1')).toBe(false);
    expect(rolls()).toEqual([expect.objectContaining({ kind: 'loss', stat: 'SAN', roll: 6, from: 50, to: 44, agentId: 'A1' })]);
  });

  it('Project rolls 1D4 once, then the chosen Bond, WP and the loss all drop by it (p. 74)', async () => {
    const first = await press('san:project:A1');
    expect(first.data.content).toContain('Rolled **3**');
    expect(first.data.components?.[0].components.map((b) => b.custom_id)).toEqual(['san:bond:A1:0']);
    const again = await press('san:project:A1'); // a double click shows the same roll, never a new one
    expect(again.data.content).toContain('Rolled **3**');
    expect(store.get('discordPending/A1')!.n).toBe(3);

    const done = await press('san:bond:A1:0');
    expect(done.data.content).toContain('loses **3** SAN');
    expect(done.data.content).toContain('Mom 10 → 7');
    expect(live()).toMatchObject({ san: 47, wp: 7, bonds: [7] });
  });

  it('a projection that would leave 0 WP spends it and the loss stands', async () => {
    store.get('games/g/agents/A1')!.live = { ...live(), wp: 2 };
    const r = await press('san:project:A1');
    expect(r.data.content).toContain('none is left: the loss stands');
    expect(live()).toMatchObject({ san: 44, wp: 0, bonds: [10] });
  });

  it('settling twice applies it once', async () => {
    await press('san:take:A1');
    const second = await press('san:take:A1');
    expect(second.data.content).toBe('This SAN loss is already settled.');
    expect(live().san).toBe(44);
    expect(rolls()).toHaveLength(1);
  });

  it('only the player, whoever claims the Agent now, or Manage Channels may decide', async () => {
    const stranger = await press('san:take:A1', KYLE);
    expect(stranger).toMatchObject({ type: 4, data: { flags: 64 } });
    expect(live().san).toBe(50);

    store.set('discordClaims/g_222', { agentId: 'A1' }); // Kyle took over Drew Rook
    expect((await press('san:project:A1', KYLE)).data.content).toContain('Rolled');

    store.set('discordPending/A1', { ...store.get('discordPending/A1')!, n: undefined });
    expect((await press('san:take:A1', '333', String(1 << 4))).data.content).toContain('loses **6** SAN'); // the Handler
  });

  it('/dg san while a loss is waiting says so and rolls nothing new', async () => {
    store.set('discordGuilds/G', { gameId: 'g' });
    const r = await handle({ type: 2, guild_id: 'G', channel_id: 'C', member: { user: { id: DANIEL }, permissions: '0' }, data: { name: 'dg', options: [
      { name: 'san', type: 1, options: [{ name: 'loss', type: 3, value: '1/1D10' }, { name: 'kind', type: 3, value: 'unnatural' }] },
    ] } }) as { data: { content: string; flags: number } };
    expect(r.data.flags).toBe(64);
    expect(r.data.content).toMatch(/already waiting.*1\/1D10.*wasn't rolled/s);
    expect(rolls()).toHaveLength(0);
    expect(live().san).toBe(50);
  });
});
