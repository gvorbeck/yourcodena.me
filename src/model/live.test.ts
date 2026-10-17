import { describe, expect, it } from 'vitest';
import { newCharacter } from './character';
import { decodeSheet, encodeSheet, freshLive, loseSan, loseStat, refreshSpent, withBond } from './live';

it('round-trips a sheet through the URL hash, including non-ASCII', () => {
  const c = newCharacter();
  c.details.name = 'Zoë 東京';
  const l = { ...freshLive(c), hp: 3, notes: 'héllo' };
  expect(decodeSheet(encodeSheet(c, l))).toEqual({ c, l });
  expect(decodeSheet('#sheet=garbage')).toBeNull();
});

it('survives large notes and rejects out-of-range values', () => {
  const c = newCharacter();
  const l = { ...freshLive(c), notes: 'x'.repeat(4000) };
  expect(decodeSheet(encodeSheet(c, l))?.l.notes.length).toBe(4000);
  expect(decodeSheet(encodeSheet(c, { ...l, hp: -5 }))).toBeNull();
  expect(decodeSheet(encodeSheet(c, { ...l, notes: 'x'.repeat(4001) }))).toBeNull();
});

it('loads links saved before the play-time fields existed', () => {
  const c = newCharacter();
  const { penalty, adapt, statMod, statLoss, ...old } = freshLive(c);
  const hash = encodeSheet(c, old as ReturnType<typeof freshLive>);
  expect(decodeSheet(hash)?.l).toMatchObject({ penalty: 0, adapt: { v: 0, h: 0 }, statMod: {}, statLoss: {} });
});

describe('SAN loss', () => {
  const c = newCharacter(); // POW 10: SAN 50, BP 40
  const live = () => ({ ...freshLive(c), bonds: [8, 8] });
  it('resets the Breaking Point and flags a disorder (p. 68)', () => {
    const r = loseSan(c, { ...live(), san: 45 }, 5, 'unnatural');
    expect(r.live).toMatchObject({ san: 40, bp: 30 });
    expect(r.notes.join()).toMatch(/Temporary insanity.*Breaking Point/);
  });
  it('adapts after three losses in a row, and a reset clears the count (p. 74)', () => {
    let l = live();
    for (let i = 0; i < 2; i++) l = loseSan(c, l, 1, 'violence').live;
    expect(l.adapt.v).toBe(2);
    expect(loseSan(c, l, 5, 'violence').live.adapt.v).toBe(0);
    const r = loseSan(c, l, 1, 'violence', () => 0.5); // 1D6 = 4
    expect(r.live).toMatchObject({ adapt: { v: 3 }, statMod: { CHA: -4 }, bonds: [4, 4] });
  });
  it('loses POW and caps WP when adapting to helplessness', () => {
    let l = live();
    for (let i = 0; i < 3; i++) l = loseSan(c, l, 1, 'helplessness', () => 0.5).live;
    expect(l).toMatchObject({ statMod: { POW: -4 }, wp: 6 });
  });
  it('never takes a stat below 3', () => {
    expect(loseStat(c, live(), 'STR', 20)).toMatchObject({ lost: 7 });
  });
});

describe('review fixes', () => {
  it('resets the Breaking Point from current POW, veteran penalty included', () => {
    const c = newCharacter();
    c.stats.POW = 12; c.veteran = 'captivity'; // POW −3 → 9, SAN 60 − 5 = 55, BP 46
    const l = freshLive(c);
    expect(l.bp).toBe(46);
    expect(loseSan(c, { ...l, san: 47 }, 2, 'unnatural').live).toMatchObject({ san: 45, bp: 36 }); // 45 − 9, not 45 − 12
  });
  it('rejects negative temporary loss, positive permanent change and unknown stats', () => {
    const c = newCharacter();
    const bad = (patch: object) => decodeSheet(encodeSheet(c, { ...freshLive(c), ...patch } as ReturnType<typeof freshLive>));
    expect(bad({ statLoss: { STR: -18 } })).toBeNull();
    expect(bad({ statMod: { STR: 5 } })).toBeNull();
    expect(bad({ statLoss: { FOO: 1 } })).toBeNull();
    expect(bad({ statLoss: { STR: 2 }, statMod: { CHA: -1 } })).not.toBeNull();
  });
  it('replaces a Bond without holes or stale scores', () => {
    expect(withBond([7, 8], 1, 5, 9)).toEqual([7, 5]);
    expect(withBond([7], 2, 4, 9)).toEqual([7, 9, 4]);
    expect(withBond([7], 0, -3, 9)).toEqual([0]);
  });
  it('gives first aid and the injury test back when HP drops, and the test back above 2 HP', () => {
    const c = newCharacter();
    const spent = { heal: true, rest: true, sleep: true, injury: true };
    const l = { ...freshLive(c), spent };
    const same = { ...l, hp: 2 };
    expect(refreshSpent(same, 2)).toBe(same); // unchanged HP: nothing resets, same object returned
    expect(refreshSpent({ ...l, hp: 2 }, 2).spent).toEqual(spent);
    expect(refreshSpent({ ...l, hp: 1 }, 2).spent).toEqual({ ...spent, heal: false, injury: false });
    expect(refreshSpent({ ...l, hp: 6 }, 2).spent).toEqual({ ...spent, injury: false }); // healed: heal stays spent
  });
});
