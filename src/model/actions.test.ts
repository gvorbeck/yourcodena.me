import { describe, expect, it, vi } from 'vitest';
import { newCharacter } from './character';
import { adapted, addDisorder, adjustStatLoss, applyInjury, burnout, checkSkill, uncheckSkill, exhaust, heal, lowestD10, planSanLoss, project, recuperate, repress, sleep, spendInjuryTest, spendWillpower, strain } from './actions';
import { freshLive } from './live';

const c = (() => { const x = newCharacter(); x.professionId = 'police-officer'; return x; })(); // all stats 10: HP 10, WP 10, Bonds 10
const live = (over: Partial<ReturnType<typeof freshLive>> = {}) => ({ ...freshLive(c), bonds: [10, 10, 10], ...over });
const mid = () => 0.5; // 1D6 = 4, 1D4 = 3
const low = () => 0; // every die shows 1

describe('fumble costs (p. 44)', () => {
  it('strain and burnout lose 1D6, never below 0', () => {
    expect(strain(live(), mid).live.hp).toBe(6);
    expect(burnout(live({ wp: 3 }), mid).live.wp).toBe(0);
  });
  it('exhaustion costs WP and sets the −20% flag', () => {
    expect(exhaust(live(), mid).live).toMatchObject({ wp: 6, exhausted: true });
  });
});

describe('healing (p. 55)', () => {
  it('first aid heals 1D4 up to the maximum and marks the HP it left off at', () => {
    expect(heal(c, live({ hp: 5 }), mid).live).toMatchObject({ hp: 8, spent: { healHp: 8 } });
    expect(heal(c, live({ hp: 9 }), mid).live.hp).toBe(10);
  });
  it('recuperation: 1 on success, 1D4 on a critical, −1 on a fumble, and uses up the day', () => {
    const l = live({ hp: 5 });
    expect(recuperate(c, l, 'success').hp).toBe(6);
    expect(recuperate(c, l, 'critical success', mid).hp).toBe(8);
    expect(recuperate(c, l, 'failure').hp).toBe(5);
    expect(recuperate(c, l, 'fumble')).toMatchObject({ hp: 4, spent: { rest: true } });
    expect(recuperate(c, live({ hp: 0 }), 'fumble').hp).toBe(0);
  });
  it('the injury test is spent when rolled; the loss is the lowest d10', () => {
    expect(spendInjuryTest(live({ hp: 2 })).spent.injuryHp).toBe(2);
    expect([lowestD10(5), lowestD10(37), lowestD10(80), lowestD10(10), lowestD10(100)]).toEqual([5, 3, 8, 1, 10]);
  });
  it('a permanent injury lowers the stat and caps HP', () => {
    const r = applyInjury(c, live(), 'CON', 4);
    expect(r.live.statMod).toEqual({ CON: -4 });
    expect(r.live.hp).toBe(8); // (10 + 6) / 2
  });
});

describe('sleep (p. 47)', () => {
  it('restores 1D6 WP up to the maximum, cures exhaustion, returns a point of each lost stat', () => {
    const r = sleep(c, live({ wp: 3, exhausted: true, statLoss: { STR: 2, DEX: 1 } }), mid);
    expect(r.live).toMatchObject({ wp: 7, exhausted: false, statLoss: { STR: 1, DEX: 0 }, spent: { sleep: true } });
    expect(sleep(c, live({ wp: 9 }), mid).live.wp).toBe(10);
  });
  it('temporary stat loss stays between 0 and 18', () => {
    expect(adjustStatLoss(live(), 'STR', -1).statLoss.STR).toBe(0);
    expect(adjustStatLoss(live({ statLoss: { STR: 18 } }), 'STR', 1).statLoss.STR).toBe(18);
  });
});

describe('planning a SAN loss (pp. 67, 74)', () => {
  const pass = () => ({ ok: true, roll: 10, chance: 50 });
  const fail = () => ({ ok: false, roll: 90, chance: 50 });
  it('rejects loss text that is not success/failure', () => {
    expect(planSanLoss(live(), 'violence', '1D4', pass)).toEqual({ error: expect.stringContaining('success/failure') });
  });
  it('takes the success or failure amount from the roll', () => {
    expect(planSanLoss(live(), 'violence', '0/1D4', pass, mid)).toMatchObject({ amount: 0, result: expect.stringContaining('Passed') });
    expect(planSanLoss(live(), 'violence', '0/1D4', fail, mid)).toMatchObject({ amount: 3, result: expect.stringContaining('Failed') });
  });
  it('adaptation passes without rolling, except at 0 WP', () => {
    const test = vi.fn(fail);
    const l = live({ adapt: { v: 3, h: 0 } });
    expect(adapted(l, 'violence')).toBe(true);
    expect(adapted(l, 'unnatural')).toBe(false);
    expect(planSanLoss(l, 'violence', '1/1D6', test)).toMatchObject({ amount: 1 });
    expect(test).not.toHaveBeenCalled();
    expect(planSanLoss({ ...l, wp: 0 }, 'violence', '1/1D6', test, mid)).toMatchObject({ amount: 4 });
    expect(test).toHaveBeenCalledOnce();
  });
});

describe('projecting and repressing (pp. 74–75)', () => {
  it('spending WP strains the chosen Bond by the same amount', () => {
    expect(spendWillpower(c, live(), 1, mid)).toMatchObject({ n: 3, ok: true, live: { wp: 7, bonds: [10, 7, 10] } });
  });
  it('with no WP left the Bond is spared and nothing helps', () => {
    const r = spendWillpower(c, live({ wp: 3 }), 1, mid);
    expect(r).toMatchObject({ ok: false, live: { wp: 0, bonds: [10, 10, 10] } });
  });
  it('projecting reduces the pending loss to a minimum of zero', () => {
    const pending = { kind: 'violence' as const, amount: 5, result: '' };
    expect(project(c, live(), pending, 0, mid)).toMatchObject({ pending: { amount: 2 }, live: { wp: 7, bonds: [7, 10, 10] } });
    expect(project(c, live(), { ...pending, amount: 2 }, 0, mid).pending.amount).toBe(0);
    expect(project(c, live({ wp: 3 }), pending, 0, mid).pending.amount).toBe(5);
  });
  it('repressing rolls SAN with the WP that is left', () => {
    const test = vi.fn(() => true);
    const r = repress(c, live({ wp: 5 }), 0, test, mid);
    expect(test).toHaveBeenCalledWith(2);
    expect(r.live).toMatchObject({ wp: 2, bonds: [7, 10, 10] });
    expect(r.notes[0]).toMatch(/suppressed/);
    const none = vi.fn(() => true);
    expect(repress(c, live({ wp: 3 }), 0, none, mid).notes[0]).toMatch(/cannot repress/);
    expect(none).not.toHaveBeenCalled();
    expect(repress(c, live(), 0, () => false, low).notes[0]).toMatch(/takes hold/);
  });
});

describe('mind and skills', () => {
  it('a new disorder can replace a motivation', () => {
    const r = addDisorder(live(), 'Paranoia', 'Duty');
    expect(r.live).toMatchObject({ disorders: ['Paranoia'], dropped: ['Duty'] });
    expect(addDisorder(live(), 'Amnesia', '').live.dropped).toEqual([]);
  });
  it('a failed skill is checked once', () => {
    expect(checkSkill(checkSkill(live(), 'Law'), 'Law').checked).toEqual(['Law']);
  });
  it('unchecking removes only that skill', () => {
    expect(uncheckSkill(live({ checked: ['Law', 'Art'] }), 'Law').checked).toEqual(['Art']);
  });
});
