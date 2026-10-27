import { describe, expect, it } from 'vitest';
import { newCharacter } from '../../src/model/character';
import { freshLive, type Live } from '../../src/model/live';
import { agentOf, applyHit, bondsOf, canProject, choicesFor, diceEntry, findTest, finishSan, isDice, planSan, rollAgainst, rollExpression, rollTest, sheetLines, testsOf } from './dg';

const agent = (live?: Partial<ReturnType<typeof freshLive>>) => {
  const c = newCharacter();
  c.details.codename = 'Drew Rook';
  return agentOf({ character: c, live: live ? { ...freshLive(c), ...live } : null });
};

describe('testsOf', () => {
  it('lists stats ×5, Luck, SAN and skills like the live sheet', () => {
    const t = testsOf(agent());
    expect(t.find((x) => x.id === 'stat:STR')).toMatchObject({ label: 'STR', chance: 50 });
    expect(t.find((x) => x.id === 'luck')).toMatchObject({ chance: 50 });
    expect(t.find((x) => x.id === 'san')).toMatchObject({ label: 'SAN test', chance: 50 });
    expect(t.find((x) => x.id === 'skill:Alertness')).toMatchObject({ label: 'Alertness', chance: 20, skill: true });
  });
  it('applies temporary stat loss', () => {
    expect(testsOf(agent({ statLoss: { DEX: 3 } })).find((x) => x.id === 'stat:DEX')?.chance).toBe(35);
  });
});

describe('findTest and choicesFor', () => {
  it('finds by picked value or typed name', () => {
    const a = agent();
    expect(findTest(a, 'skill:Alertness')?.label).toBe('Alertness');
    expect(findTest(a, 'alertness')?.label).toBe('Alertness');
    expect(findTest(a, 'str')?.id).toBe('stat:STR');
    expect(findTest(a, 'nothing like this')).toBeNull();
  });
  it('offers at most 25 choices with their chance', () => {
    expect(choicesFor(agent(), '')).toHaveLength(25);
    expect(choicesFor(agent(), 'aler')).toEqual([{ name: 'Alertness 20%', value: 'skill:Alertness' }]);
  });
});

describe('rollTest', () => {
  const str = (a: ReturnType<typeof agent>) => findTest(a, 'stat:STR')!;
  it('matches the live sheet math', () => {
    const a = agent();
    expect(rollTest(a, str(a), 45)).toMatchObject({ chance: 50, penalty: 0, outcome: 'success' });
    expect(rollTest(a, str(a), 45, -20)).toMatchObject({ chance: 30, penalty: 20, outcome: 'failure' });
    expect(rollTest(a, str(a), 45, 20)).toMatchObject({ chance: 70, penalty: 0 });
  });
  it('counts exhaustion, the flat penalty and low WP', () => {
    const a = agent({ exhausted: true, penalty: 10, wp: 2 });
    expect(rollTest(a, str(a), 5)).toMatchObject({ chance: 0, penalty: 50 });
  });
  it('fails everything at 0 WP', () => {
    const a = agent({ wp: 0 });
    expect(rollTest(a, str(a), 2).outcome).toBe('failure');
  });
});

describe('sheetLines', () => {
  it('shows current and max values and conditions', () => {
    const lines = sheetLines(agent({ hp: 7, exhausted: true, checked: ['Alertness'] }));
    expect(lines[0]).toBe('Drew Rook');
    expect(lines[1]).toBe('HP 7/10 · WP 10/10 · SAN 50/99 · BP 40');
    expect(lines.slice(2)).toEqual(['Exhausted (−20%)', 'Marked for improvement: Alertness']);
  });
});

describe('rollExpression', () => {
  const fixed = (...faces: number[]) => { let i = 0; return () => faces[i++]; };
  it('rolls dice plus a modifier, never below 0', () => {
    expect(rollExpression('2d6+1', fixed(4, 3))).toEqual({ expr: '2D6+1', dice: [4, 3], mod: 1, total: 8 });
    expect(rollExpression('D10', fixed(7))).toMatchObject({ expr: '1D10', total: 7 });
    expect(rollExpression('1d4-2', fixed(1))).toMatchObject({ expr: '1D4-2', total: 0 });
    expect(rollExpression('7', fixed())).toEqual({ expr: '7', dice: [], mod: 0, total: 7 });
  });
  it('rejects anything else, so test names still reach the test lookup', () => {
    for (const bad of ['', 'alertness', 'stat:STR', 'skill:Firearms', '0d6', '99d6', '2d6+1000']) expect(rollExpression(bad, fixed(1))).toBeNull();
  });
});

describe('isDice and rollAgainst', () => {
  it('tells dice from a number typed into test:', () => {
    expect(isDice('2d6+1')).toBe(true);
    expect(isDice('45')).toBe(false);
    expect(isDice('3+2')).toBe(false);
    expect(isDice('alertness')).toBe(false);
  });
  it('rolls d% against a number, with the same modifier as a test', () => {
    expect(rollAgainst(45, 30)).toEqual({ label: 'd%', chance: 45, penalty: 0, roll: 30, outcome: 'success' });
    expect(rollAgainst(45, 30, -20)).toMatchObject({ chance: 25, penalty: 20, outcome: 'failure' });
    expect(rollAgainst(45, 55)).toMatchObject({ outcome: 'fumble' });
  });
});

describe('applyHit', () => {
  const hit = { expr: '1D10', dice: [7], mod: 0, total: 7 };
  it('writes only live.hp when the sheet has been played, never below 0', () => {
    expect(applyHit({ live: { hp: 11 } }, hit, 'Drew Rook')).toEqual({
      leaves: [[['live', 'hp'], 4]],
      entry: { ...diceEntry(hit, 'Drew Rook'), kind: 'loss', stat: 'HP', from: 11, to: 4, notes: ['Stunned (p. 55)'], hpFrom: 11, hpTo: 4 },
    });
    expect(applyHit({ live: { hp: 3 } }, hit, 'Drew Rook').entry).toMatchObject({ to: 0, notes: ['Dead (p. 55)'] });
  });
  it('needs only HP, so a sheet that won\'t parse still takes damage', () => {
    expect(applyHit({ character: { broken: true }, live: { hp: 11 } }, hit, 'Drew Rook').entry.to).toBe(4);
  });
  it('starts from the fresh play state when live play was never saved', () => {
    const { leaves, entry } = applyHit({ character: newCharacter(), live: null }, hit, 'Drew Rook');
    expect(entry).toMatchObject({ from: 10, to: 3 });
    expect(leaves).toMatchObject([[['live'], { hp: 3, wp: 10, san: 50 }]]);
  });
});

describe('SAN loss in steps', () => {
  // Math.random-shaped values in order: the d% SAN test first, then each loss die.
  const seq = (...xs: number[]) => { let i = 0; return () => xs[i++]; };
  const agentWith = (live: Partial<Live> = {}, bond = 'Mom') => {
    const c = newCharacter();
    c.details.codename = 'Drew Rook';
    c.bonds = [{ name: bond, note: '' }];
    return agentOf({ character: c, live: { ...freshLive(c), ...live } });
  };
  const plan = (a: ReturnType<typeof agentWith>, loss: string, kind: 'violence' | 'unnatural', rng: () => number) => {
    const p = planSan(a, loss, kind, rng);
    if ('error' in p) throw new Error(p.error);
    return p;
  };

  it('plans: fails the SAN test (logged on its own) and rolls the failure side', () => {
    const p = plan(agentWith(), '0/1d6', 'violence', seq(0.62, 0.5));
    expect(p.test).toEqual({ label: 'SAN (loss)', chance: 50, penalty: 0, roll: 63, outcome: 'failure' });
    expect(p.stake).toEqual({ kind: 'violence', expr: '0/1D6', amount: 4, note: '' });
  });
  it('plans: plain dice skip the test; adaptation passes it automatically (p. 74)', () => {
    expect(plan(agentWith(), '3', 'unnatural', seq())).toEqual({ stake: { kind: 'unnatural', expr: '3', amount: 3, note: '' }, test: null });
    expect(plan(agentWith({ adapt: { v: 3, h: 0 } }), '0/1D6', 'violence', seq())).toMatchObject({
      stake: { amount: 0, note: 'Adapted to violence: the SAN test automatically succeeds (p. 74).' }, test: null,
    });
    expect(planSan(agentWith(), 'lots', 'violence', seq())).toMatchObject({ error: expect.stringContaining('0/1D4') });
  });
  it('offers projection only when it can help (a loss, 2+ WP, a Bond with points)', () => {
    expect(canProject(agentWith(), 4)).toBe(true);
    expect(canProject(agentWith(), 0)).toBe(false);
    expect(canProject(agentWith({ wp: 1 }), 4)).toBe(false);
    expect(canProject(agentWith({ bonds: [0] }), 4)).toBe(false);
    expect(canProject(agentWith({}, ''), 4)).toBe(false); // an unnamed Bond doesn't count
    expect(bondsOf(agentWith())).toEqual([{ i: 0, name: 'Mom', score: 10 }]);
  });
  it('finishes without projecting: only what changed is written', () => {
    const a = agentWith(), { stake } = plan(a, '0/1D6', 'violence', seq(0.62, 0.5));
    expect(finishSan(a, stake, null, 'Drew Rook', seq())).toEqual({
      leaves: [[['live', 'san'], 46], [['live', 'adapt', 'v'], 1]],
      entry: expect.objectContaining({ kind: 'loss', stat: 'SAN', label: '0/1D6', roll: 4, from: 50, to: 46, cause: 'violence', notes: [] }),
    });
  });
  it('finishes with a projection: WP and the Bond drop, and so does the loss (p. 74)', () => {
    const a = agentWith(), stake = { kind: 'unnatural' as const, expr: '1D8', amount: 6, note: '' };
    const r = finishSan(a, stake, { bond: 0, n: 3 }, 'Drew Rook', seq());
    expect(r.entry).toMatchObject({ roll: 3, from: 50, to: 47 });
    expect(r.entry.notes[0]).toBe('Mom 10 → 7');
    expect(r.leaves).toEqual(expect.arrayContaining([[['live', 'wp'], 7], [['live', 'san'], 47], [['live', 'bonds'], [7]]]));
  });
  it('a projection that would leave 0 WP spends it and the loss stands', () => {
    const r = finishSan(agentWith({ wp: 2 }), { kind: 'unnatural', expr: '6', amount: 6, note: '' }, { bond: 0, n: 3 }, 'Drew Rook', seq());
    expect(r.entry).toMatchObject({ roll: 6, to: 44, notes: expect.arrayContaining(['Spent 3 WP but none is left: the loss stands.']) });
    expect(r.leaves).toContainEqual([['live', 'wp'], 0]);
  });
  it('applies temporary insanity and Breaking Point from the sheet rules', () => {
    const r = finishSan(agentWith({ san: 45, bp: 42 }), { kind: 'unnatural', expr: '5', amount: 5, note: '' }, null, 'Drew Rook', seq());
    expect(r.entry.to).toBe(40);
    expect(r.entry.notes.join(' ')).toMatch(/Temporary insanity.*Breaking Point reached/);
    expect(r.leaves).toContainEqual([['live', 'bp'], 30]);
  });
});
