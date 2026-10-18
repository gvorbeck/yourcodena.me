import { describe, expect, it } from 'vitest';
import { newCharacter } from './character';
import { advanceSkills, maxSanOf, setUnnatural, decodeSheet, encodeSheet, freshLive, untouched, loseSan, loseStat, UndoStack, canHeal, describeChange, canInjuryTest, refreshSpent, sameState, withBond } from './live';

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
  const { penalty, exhausted, checked, advance, disorders, dropped, adapt, statMod, statLoss, ...old } = freshLive(c);
  const hash = encodeSheet(c, old as ReturnType<typeof freshLive>);
  expect(decodeSheet(hash)?.l).toMatchObject({ penalty: 0, exhausted: false, adapt: { v: 0, h: 0 }, statMod: {}, statLoss: {} });
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
    c.stats.POW = 12; c.veteran = 'captivity'; // POW −3 → 9, SAN 60 − 5 = 55, BP 60 − 9 = 51 (starting SAN is pre-veteran; the book is silent on Captivity's POW drop)
    const l = freshLive(c);
    expect(l.bp).toBe(51);
    expect(loseSan(c, { ...l, san: 53 }, 2, 'unnatural').live).toMatchObject({ san: 51, bp: 42 }); // 51 − 9, not 51 − 12
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
  it('allows first aid again only below where the last aid left HP, and always at 0 HP', () => {
    const l = { ...freshLive(newCharacter()), hp: 5, spent: { healHp: 5, injuryHp: null, rest: false, sleep: false } };
    expect(canHeal(l)).toBe(false);
    expect(canHeal({ ...l, hp: 6 })).toBe(false); // resting up does not re-arm it
    expect(canHeal({ ...l, hp: 4 })).toBe(true);
    expect(canHeal({ ...l, hp: 0 })).toBe(true);
    expect(canHeal({ ...l, spent: { ...l.spent, healHp: null } })).toBe(true);
  });
  it('gives the injury test back after further damage, or once HP has been above 2', () => {
    const l = { ...freshLive(newCharacter()), hp: 2, spent: { healHp: null, injuryHp: 2, rest: false, sleep: false } };
    expect(canInjuryTest(l)).toBe(false);
    expect(canInjuryTest({ ...l, hp: 1 })).toBe(true);
    expect(refreshSpent(l)).toBe(l); // still at 2: stays spent
    const healed = refreshSpent({ ...l, hp: 6 });
    expect(healed.spent.injuryHp).toBeNull();
    expect(canInjuryTest({ ...healed, hp: 2 })).toBe(true); // a new drop to 2 is a new test
  });
  it('does not count notes or spent flags as an undoable change', () => {
    const l = freshLive(newCharacter());
    expect(sameState(l, { ...l, notes: 'typing…', spent: { ...l.spent, rest: true, healHp: 3 } })).toBe(true);
    expect(sameState(l, { ...l, hp: l.hp - 1 })).toBe(false);
    expect(sameState(l, { ...l, bonds: [...l.bonds].map((b) => b - 1) })).toBe(false);
  });
  it('undoes changes in order, keeps typed notes, and skips notes-only edits', () => {
    const stack = new UndoStack();
    const a = { ...freshLive(newCharacter()), notes: 'a' };
    const b = { ...a, hp: a.hp - 1, notes: 'b' };
    const c2 = { ...b, san: b.san - 3, notes: 'c' };
    expect(stack.record(a, { ...a, notes: 'typing' })).toBe(false);
    expect(stack.record(a, b)).toBe(true);
    expect(stack.record(b, c2)).toBe(true);
    expect(stack.size).toBe(2);
    expect(stack.undo({ ...c2, notes: 'latest notes' })).toMatchObject({ hp: b.hp, san: b.san, notes: 'latest notes' });
    expect(stack.undo(b)).toMatchObject({ hp: a.hp, san: a.san });
    expect(stack.undo(a)).toBeNull();
  });
  it('keeps at most 30 undo steps', () => {
    const stack = new UndoStack();
    let l = freshLive(newCharacter());
    for (let i = 0; i < 40; i++) { const next = { ...l, hp: l.hp + 1 }; stack.record(l, next); l = next; }
    expect(stack.size).toBe(30);
  });
  it('describes a change for the Undo button', () => {
    const a = freshLive(newCharacter());
    expect(describeChange(a, { ...a, hp: a.hp - 1 })).toBe(`HP ${a.hp}→${a.hp - 1}`);
    expect(describeChange(a, { ...a, san: a.san - 4, wp: a.wp - 2 })).toBe(`WP ${a.wp}→${a.wp - 2}, SAN ${a.san}→${a.san - 4}`);
    expect(describeChange(a, { ...a, hp: 1, wp: 1, san: 1 })).toMatch(/\+1$/);
    expect(describeChange(a, { ...a, statMod: { CHA: -3 } })).toBe('CHA (permanent) 0→-3');
  });
  it('labels each undo step with what it would revert', () => {
    const stack = new UndoStack();
    const a = freshLive(newCharacter());
    expect(stack.label).toBeNull();
    const b = { ...a, hp: a.hp - 1 };
    stack.record(a, b);
    expect(stack.label).toBe(`HP ${a.hp}→${b.hp}`);
    stack.record(b, { ...b, san: b.san - 2 });
    expect(stack.label).toBe(`SAN ${b.san}→${b.san - 2}`);
    stack.undo(b);
    expect(stack.label).toBe(`HP ${a.hp}→${b.hp}`);
  });
  it('names Bonds in the Undo label and falls back to a generic one', () => {
    const a = { ...freshLive(newCharacter()), bonds: [8, 8] };
    expect(describeChange(a, { ...a, bonds: [8, 5] }, ['Sam', 'Kay'])).toBe('Kay 8→5');
    expect(describeChange(a, { ...a, bonds: [8, 5] }, ['', ''])).toBe('Bond 2 8→5');
    expect(describeChange(a, { ...a, bonds: [8, 8, 8] })).toBe('last change'); // a longer array with no changed score
  });
  it('treats a missing stat key as 0 when comparing states', () => {
    const a = freshLive(newCharacter());
    expect(sameState(a, { ...a, statMod: { CHA: 0 }, statLoss: { STR: 0 } })).toBe(true);
    expect(sameState(a, { ...a, statLoss: { STR: 1 } })).toBe(false);
  });
});

it('a sheet is untouched until something is played or noted, so it can follow the character', () => {
  const c = newCharacter();
  const l = freshLive(c);
  expect(untouched(l, c)).toBe(true);
  expect(untouched({ ...l, hp: l.hp - 1 }, c)).toBe(false);
  expect(untouched({ ...l, notes: 'x' }, c)).toBe(false);
  const stronger = { ...c, stats: { ...c.stats, POW: 14 } };
  expect(untouched(l, stronger)).toBe(false); // the sheet no longer matches a different character
  expect(freshLive(stronger).san).toBeGreaterThan(l.san);
});

describe('damaged veterans start adapted (p. 38)', () => {
  it('Extreme Violence adapts to violence only; Captivity to helplessness only', () => {
    const c = newCharacter();
    expect(freshLive(c).adapt).toEqual({ v: 0, h: 0 });
    c.veteran = 'violence';
    expect(freshLive(c).adapt).toEqual({ v: 3, h: 0 });
    c.veteran = 'captivity';
    expect(freshLive(c).adapt).toEqual({ v: 0, h: 3 });
    c.veteran = 'hard';
    expect(freshLive(c).adapt).toEqual({ v: 0, h: 0 });
  });
});

describe('Breaking Point with veterans (p. 38 example: SAN 60→55, BP stays 48)', () => {
  it('only Things Man Was Not Meant to Know lowers BP with SAN', () => {
    const c = newCharacter();
    c.stats.POW = 12;
    const bp = (v: string) => { c.veteran = v; return freshLive(c).bp; };
    expect([bp(''), bp('violence'), bp('hard'), bp('unnatural')]).toEqual([48, 48, 48, 36]);
  });
});

describe('skill advancement and Unnatural (pp. 15, 28)', () => {
  const c = () => { const x = newCharacter(); x.professionId = 'police-officer'; return x; };
  it('adds 1D4 to each checked skill, caps at 99, and clears the checks', () => {
    const x = c();
    const l = { ...freshLive(x), checked: ['Alertness', 'Law'] };
    const r = advanceSkills(x, l, () => 0.99); // 1D4 = 4
    expect(r.gains).toEqual([['Alertness', 4], ['Law', 4]]);
    expect(r.live).toMatchObject({ checked: [], advance: { Alertness: 4, Law: 4 } });
    const top = advanceSkills(x, { ...l, checked: ['Alertness'], advance: { Alertness: 38 } }, () => 0.99); // 60 + 38 = 98
    expect(top.gains).toEqual([['Alertness', 1]]);
  });
  it('Unnatural lowers maximum SAN and pulls SAN down with it', () => {
    const x = c();
    const l = freshLive(x);
    expect(maxSanOf(x, l)).toBe(99);
    const r = setUnnatural(x, { ...l, san: 95 }, 10);
    expect(maxSanOf(x, r)).toBe(89);
    expect(r.san).toBe(89);
    x.veteran = 'unnatural'; // starts at 10, so it can't be set lower
    expect(maxSanOf(x, setUnnatural(x, freshLive(x), 0))).toBe(89);
  });
  it('counts checks and disorders as play, so a rebuild does not wipe them', () => {
    const x = c();
    expect(untouched(freshLive(x), x)).toBe(true);
    expect(untouched({ ...freshLive(x), checked: ['Law'] }, x)).toBe(false);
    expect(untouched({ ...freshLive(x), disorders: ['Paranoia'] }, x)).toBe(false);
  });
  it('starts with the Unnatural veteran disorder', () => {
    const x = c(); x.veteran = 'unnatural'; x.disorder = 'Amnesia';
    expect(freshLive(x).disorders).toEqual(['Amnesia']);
  });
});
