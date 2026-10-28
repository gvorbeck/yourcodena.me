// The /dg san projection buttons end to end, against a small in-memory stand-in for Firestore.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { newCharacter } from '../../src/model/character';
import { freshLive } from '../../src/model/live';

const store = new Map<string, Record<string, unknown>>();
const DELETE = Symbol('delete');
let ids = 0;
let beforeCommit = () => {}; // runs just before a batch commits, to stage a race
const exists = (path: string) => Object.assign(new Error(`${path} already exists`), { code: 6 });

vi.mock('node:crypto', async (orig) => ({ ...(await orig<typeof import('node:crypto')>()), randomInt: () => 3 })); // every 1D4 is a 3

vi.mock('firebase-admin/firestore', () => {
  class Union { constructor(readonly items: unknown[]) {} }
  class FieldPath { segments: string[]; constructor(...s: string[]) { this.segments = s; } }
  const setPath = (o: Record<string, unknown>, path: string[], v: unknown) => {
    const last = path.at(-1)!, parent = path.slice(0, -1).reduce<Record<string, unknown>>((x, k) => (x[k] ??= {}) as Record<string, unknown>, o);
    if (v === DELETE) delete parent[last];
    else if (v instanceof Union) parent[last] = [...new Set([...((parent[last] as unknown[]) ?? []), ...v.items])];
    else parent[last] = v;
  };
  const pathOf = (k: unknown) => (k instanceof FieldPath ? k.segments : String(k).split('.'));
  const snap = (path: string) => {
    const d = store.get(path);
    return { id: path.split('/').at(-1), exists: d !== undefined, data: () => d && structuredClone(d), get: (k: string) => d?.[k] };
  };
  const ref = (path: string) => ({
    path,
    get: async () => snap(path),
    set: async (v: Record<string, unknown>) => { store.set(path, structuredClone(v)); },
    delete: async () => { store.delete(path); },
    update: async (...args: unknown[]) => {
      const d = store.get(path)!;
      if (args.length === 1) for (const [k, v] of Object.entries(args[0] as Record<string, unknown>)) setPath(d, k.split('.'), v);
      else for (let i = 0; i < args.length; i += 2) setPath(d, pathOf(args[i]), args[i + 1]);
    },
  });
  type Ref = ReturnType<typeof ref>;
  const db = {
    doc: ref,
    collection: (p: string) => ({ doc: () => ref(`${p}/id${++ids}`), add: async (v: Record<string, unknown>) => ref(`${p}/id${++ids}`).set(v) }),
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn({
      get: (r: Ref) => r.get(), update: (r: Ref, ...a: unknown[]) => r.update(...a),
      create: (r: Ref, v: Record<string, unknown>) => { if (store.has(r.path)) throw exists(r.path); return r.set(v); }, delete: (r: Ref) => r.delete(),
    }),
    batch: () => {
      const creates: [Ref, Record<string, unknown>][] = [], updates: [Ref, unknown[]][] = [];
      return {
        create: (r: Ref, v: Record<string, unknown>) => { creates.push([r, v]); },
        update: (r: Ref, ...a: unknown[]) => { updates.push([r, a]); },
        commit: async () => {
          beforeCommit();
          const taken = creates.find(([r]) => store.has(r.path));
          if (taken) throw exists(taken[0].path); // all or nothing, like Firestore
          for (const [r, v] of creates) await r.set(v);
          for (const [r, a] of updates) await r.update(...a);
        },
      };
    },
  };
  return { FieldPath, FieldValue: { delete: () => DELETE, arrayUnion: (...v: unknown[]) => new Union(v) }, getFirestore: () => db };
});

const { clearCaches, handle } = await import('./bot');

const DANIEL = '111', KYLE = '222';
const press = (custom_id: string, user = DANIEL, permissions = '0') =>
  handle({ type: 3, data: { custom_id }, guild_id: 'G', channel_id: 'C', member: { user: { id: user }, permissions } }) as Promise<{ type: number; data: { content: string; flags?: number; components?: { components: { custom_id: string }[] }[] } }>;
const live = () => store.get('games/g/agents/A1')!.live as { san: number; wp: number; bonds: number[] };
const rolls = () => [...store.entries()].filter(([k]) => k.startsWith('games/g/rolls/')).map(([, v]) => v);

beforeEach(() => {
  store.clear();
  beforeCommit = () => {};
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

  let clock = Date.now(); // each command 10 s apart, so the 2 s cooldown never trips
  const san = (loss: string, now = (clock += 10_000)) => handle({ type: 2, guild_id: 'G', channel_id: 'C', member: { user: { id: DANIEL }, permissions: '0' }, data: { name: 'dg', options: [
    { name: 'san', type: 1, options: [{ name: 'loss', type: 3, value: loss }, { name: 'kind', type: 3, value: 'unnatural' }] },
  ] } }, now) as Promise<{ data: { content: string; flags: number } }>;

  it('/dg san while a loss is waiting says so and rolls nothing new', async () => {
    store.set('discordGuilds/G', { gameId: 'g' });
    const r = await san('1/1D10');
    expect(r.data.flags).toBe(64);
    expect(r.data.content).toMatch(/already waiting.*1\/1D10.*wasn't rolled/s);
    expect(rolls()).toHaveLength(0);
    expect(live().san).toBe(50);
  });

  it('/dg san holds a loss together with its SAN test', async () => {
    store.set('discordGuilds/G', { gameId: 'g' });
    store.delete('discordPending/A1');
    expect((await san('1/1D10')).data.content).toContain('Project it onto a Bond?');
    expect(store.get('discordPending/A1')).toMatchObject({ expr: '1/1D10', testLine: expect.stringContaining('SAN \\(loss\\)') });
    expect(rolls()).toEqual([expect.objectContaining({ label: 'SAN (loss)' })]);
  });

  it('two /dg san racing: the second finds the first held loss and logs nothing', async () => {
    store.set('discordGuilds/G', { gameId: 'g' });
    store.delete('discordPending/A1');
    const other = { kind: 'violence', expr: '0/1D6', amount: 4, note: '', gameId: 'g', agentId: 'A1', userId: DANIEL, testLine: '', createdAt: 0 };
    beforeCommit = () => store.set('discordPending/A1', other); // another instance got there between the check and the write
    const r = await san('1/1D10');
    expect(r.data.content).toMatch(/already waiting.*wasn't rolled/s);
    expect(store.get('discordPending/A1')).toEqual(other);
    expect(rolls()).toHaveLength(0);
  });

  it('a SAN loss that cannot be projected posts with its test as one webhook message', async () => {
    store.set('discordGuilds/G', { gameId: 'g' });
    store.delete('discordPending/A1');
    store.set('games/g/agents/A1', { ...store.get('games/g/agents/A1')!, live: { ...live(), wp: 1 } }); // under 2 WP: no projecting
    await san('1/1D10');
    const [test, loss] = rolls();
    expect(test).toMatchObject({ label: 'SAN (loss)', answered: true }); // not posted on its own
    expect(loss).toMatchObject({ kind: 'loss', testLine: expect.stringContaining('SAN \\(loss\\)') });
    expect(loss.answered).toBeUndefined();
  });

  it('/dg roll ticks a failed skill for improvement', async () => {
    store.set('discordGuilds/G', { gameId: 'g' });
    const r = await handle({ type: 2, guild_id: 'G', channel_id: 'C', member: { user: { id: DANIEL }, permissions: '0' }, data: { name: 'dg', options: [
      { name: 'roll', type: 1, options: [{ name: 'test', type: 3, value: 'skill:Unnatural' }] }, // 0%, so the fixed roll of 3 fails
    ] } }, (clock += 10_000)) as { data: { content: string } };
    expect(r.data.content).toContain('marked for improvement');
    expect(rolls()).toEqual([expect.objectContaining({ label: 'Unnatural', outcome: 'failure' })]);
    expect((store.get('games/g/agents/A1')!.live as { checked: string[] }).checked).toEqual(['Unnatural']);
  });
});
