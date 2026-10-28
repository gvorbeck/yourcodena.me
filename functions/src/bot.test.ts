import { describe, expect, it } from 'vitest';
import { FieldPath, FieldValue } from 'firebase-admin/firestore';
import { REMOVED } from '../../src/lib/diff';
import { newCharacter } from '../../src/model/character';
import { freshLive } from '../../src/model/live';
import { agentOf } from './dg';
import { answer, cached, handle, rollerName, sanChoice, toPairs } from './bot';
import { DG } from './commands';

describe('handle', () => {
  it('answers Discord\'s ping without touching the database', async () => {
    expect(await handle({ type: 1 })).toEqual({ type: 1 });
  });
  it('refuses commands outside a server channel', async () => {
    expect(await handle({ type: 2, data: { name: 'dg', options: [{ name: 'roll', type: 1 }] } })).toMatchObject({ data: { flags: 64 } });
  });
});

describe('commands', () => {
  it('give every alias option a long-form twin', () => {
    const opts = (n: string) => DG.options.find((o) => o.name === n)!.options!.map((o) => [o.type, 'required' in o && !!o.required]);
    expect(opts('r')).toEqual(opts('roll'));
    expect(opts('d')).toEqual(opts('damage'));
  });
  it('fit Discord limits', () => {
    for (const o of DG.options) {
      expect(o.name).toMatch(/^[a-z]{1,32}$/);
      expect(o.description.length).toBeLessThanOrEqual(100);
      for (const p of o.options ?? []) expect(p.description.length).toBeLessThanOrEqual(100);
    }
  });
});

describe('answer', () => {
  it('replies privately when a webhook will post, publicly otherwise', () => {
    expect(answer('x', true)).toMatchObject({ data: { flags: 64, content: "x\n-# Posted to the game's dice channel." } });
    expect(answer('x', false)).toMatchObject({ data: { flags: 0, content: 'x' } });
  });
});

describe('rollerName', () => {
  const member = { user: { id: '1', username: 'dan', global_name: 'Daniel' }, nick: 'Drew Rook (Daniel)', permissions: '0' };
  it('prefers the claimed Agent, then nickname, display name, username', () => {
    expect(rollerName('Drew Rook', member)).toBe('Drew Rook');
    expect(rollerName(null, member)).toBe('Drew Rook (Daniel)');
    expect(rollerName(null, { ...member, nick: null })).toBe('Daniel');
    expect(rollerName(null, { ...member, nick: null, user: { id: '1', username: 'dan', global_name: null } })).toBe('dan');
    expect(rollerName(null)).toBe('Someone');
  });
});

describe('toPairs', () => {
  it('turns agent-doc leaves into update arguments, keeping dotted keys whole and deleting removed ones', () => {
    const pairs = toPairs([[['live', 'hp'], 4], [['live', 'advance', 'Science(St. Louis)'], REMOVED]]);
    expect(pairs[0]).toEqual(new FieldPath('live', 'hp'));
    expect(pairs[1]).toBe(4);
    expect(pairs[2]).toEqual(new FieldPath('live', 'advance', 'Science(St. Louis)'));
    expect(pairs[3]).toEqual(FieldValue.delete());
    expect(toPairs([])).toEqual([]);
  });
});

describe('sanChoice', () => {
  const c = newCharacter();
  c.bonds = [{ name: 'Mom', note: '' }];
  const a = agentOf({ character: c, live: freshLive(c) });
  const held = { kind: 'violence' as const, expr: '1/1D8', amount: 6, note: '', gameId: 'g', agentId: 'A1', userId: 'u', testLine: '**Drew Rook** · SAN (loss) 50% → 63 · Failure', createdAt: 0 };
  it('first asks whether to project', () => {
    const r = sanChoice(held, a, 'Drew Rook');
    expect(r.content).toContain('about to lose **6 SAN** (violence) · SAN 50 → 44');
    expect(r.components[0].components.map((b) => b.custom_id)).toEqual(['san:project:A1', 'san:take:A1']);
  });
  it('after the 1D4, offers Bonds with enough points', () => {
    const r = sanChoice({ ...held, n: 3 }, a, 'Drew Rook');
    expect(r.content).toContain('Rolled **3**: spend 3 WP (10 → 7) and lose 3 less SAN (6 → 3)');
    expect(r.components[0].components).toEqual([{ type: 2, style: 1, label: 'Mom (10 → 7)', custom_id: 'san:bond:A1:0' }]);
  });
  it('falls back to any Bond with points, warning it drops to 0', () => {
    const low = agentOf({ character: c, live: { ...freshLive(c), bonds: [2] } });
    const r = sanChoice({ ...held, n: 3 }, low, 'Drew Rook');
    expect(r.content).toContain('drops to 0');
    expect(r.components[0].components[0].label).toBe('Mom (2 → 0)');
  });
});

describe('cached', () => {
  it('remembers an answer for a while, forgets failures, and can be cleared', async () => {
    let n = 0;
    const get = cached(async (k) => { n++; if (k === 'bad') throw new Error('no'); return `${k}${n}`; }, 60_000);
    expect(await get('a')).toBe('a1');
    expect(await get('a')).toBe('a1');
    await expect(get('bad')).rejects.toThrow();
    await expect(get('bad')).rejects.toThrow(); // retried, not remembered
    expect(n).toBe(3);
    get.clear();
    expect(await get('a')).toBe('a4');
  });
});
