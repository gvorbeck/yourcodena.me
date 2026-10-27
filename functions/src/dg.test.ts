import { describe, expect, it } from 'vitest';
import { newCharacter } from '../../src/model/character';
import { freshLive } from '../../src/model/live';
import { agentOf, applyHit, choicesFor, diceEntry, findTest, isDice, rollAgainst, rollExpression, rollTest, sheetLines, testsOf } from './dg';

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
    expect(applyHit({ live: { hp: 11 } }, hit, 'Drew Rook', 5)).toEqual({
      update: { 'live.hp': 4, updatedAt: 5 },
      entry: { ...diceEntry(hit, 'Drew Rook'), kind: 'damage', hpFrom: 11, hpTo: 4 },
    });
    expect(applyHit({ live: { hp: 3 } }, hit, 'Drew Rook', 5).update).toEqual({ 'live.hp': 0, updatedAt: 5 });
  });
  it('needs only HP, so a sheet that won\'t parse still takes damage', () => {
    expect(applyHit({ character: { broken: true }, live: { hp: 11 } }, hit, 'Drew Rook', 5).entry.hpTo).toBe(4);
  });
  it('starts from the fresh play state when live play was never saved', () => {
    const { update, entry } = applyHit({ character: newCharacter(), live: null }, hit, 'Drew Rook', 5);
    expect(entry).toMatchObject({ hpFrom: 10, hpTo: 3 });
    expect(update).toMatchObject({ live: { hp: 3, wp: 10, san: 50 }, updatedAt: 5 });
  });
});
