import { describe, expect, it } from 'vitest';
import { newCharacter } from '../../src/model/character';
import { freshLive } from '../../src/model/live';
import { agentOf, choicesFor, findTest, rollTest, sheetLines, testsOf } from './dg';

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
