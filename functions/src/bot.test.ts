import { describe, expect, it } from 'vitest';
import { answer, handle, rollerName } from './bot';
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
    const opts = (n: string) => DG.options.find((o) => o.name === n)!.options!.map((o) => [o.type, o.required ?? false]);
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
