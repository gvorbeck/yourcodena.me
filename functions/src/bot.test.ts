import { describe, expect, it } from 'vitest';
import { handle } from './bot';
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
  });
  it('fit Discord limits', () => {
    for (const o of DG.options) {
      expect(o.name).toMatch(/^[a-z]{1,32}$/);
      expect(o.description.length).toBeLessThanOrEqual(100);
      for (const p of o.options ?? []) expect(p.description.length).toBeLessThanOrEqual(100);
    }
  });
});
