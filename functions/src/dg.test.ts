import { describe, expect, it } from 'vitest';
import { newCharacter } from '../../src/model/character';
import { freshLive } from '../../src/model/live';
import { agentOf, choicesFor, findTest, rollDamage, rollTest, sheetLines, testsOf } from './dg';

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

describe('rollDamage', () => {
  const fixed = (...faces: number[]) => { let i = 0; return () => faces[i++]; };
  it('rolls dice plus a modifier', () => {
    expect(rollDamage('2d6+1', false, fixed(4, 3))).toMatchObject({ kind: 'dice', expr: '2D6+1', dice: [4, 3], total: 8 });
    expect(rollDamage('D10', false, fixed(7))).toMatchObject({ expr: '1D10', total: 7 });
    expect(rollDamage('1d4-2', false, fixed(1))).toMatchObject({ expr: '1D4-2', total: 0 }); // never below 0
    expect(rollDamage('3', true, fixed())).toMatchObject({ total: 6 });
  });
  it('doubles damage on a critical', () => {
    expect(rollDamage('1d10', true, fixed(6))).toMatchObject({ total: 12, critical: true });
  });
  it('follows the Lethality example on p. 57: 15% rolls 80, so 8 + 10 = 18 HP', () => {
    expect(rollDamage('L15', false, fixed(80))).toMatchObject({ kind: 'lethality', killed: false, dice: [8, 10], total: 18 });
    expect(rollDamage('15%', false, fixed(12))).toMatchObject({ killed: true, total: 0 });
  });
  it('reads 00 and single digits as 10s', () => {
    expect(rollDamage('L10', false, fixed(100))).toMatchObject({ dice: [10, 10], total: 20 });
    expect(rollDamage('L5', false, fixed(7))).toMatchObject({ dice: [10, 7], total: 17 });
  });
  it('doubles the Lethality rating and the damage on a critical', () => {
    expect(rollDamage('L15', true, fixed(25))).toMatchObject({ killed: true });
    expect(rollDamage('L15', true, fixed(80))).toMatchObject({ killed: false, total: 36 });
  });
  it('rejects anything else', () => {
    for (const bad of ['', 'fireball', '0d6', '99d6', 'L0', 'L101', '2d6+1000']) expect(rollDamage(bad, false, fixed(1))).toBeNull();
  });
});
