import { describe, expect, it } from 'vitest';
import { REMOVED, diffPaths, mergeRemote, setDelta } from './diff';

describe('diffPaths', () => {
  it('returns nothing for equal values', () => {
    expect(diffPaths({ a: 1, b: { c: [1, 2] } }, { a: 1, b: { c: [1, 2] } })).toEqual([]);
  });
  it('writes only the leaves that changed, and replaces arrays whole', () => {
    const prev = { hp: 8, spent: { rest: false, sleep: false }, bonds: [1, 2] };
    const next = { hp: 7, spent: { rest: true, sleep: false }, bonds: [1, 3] };
    expect(diffPaths(prev, next)).toEqual([[['hp'], 7], [['spent', 'rest'], true], [['bonds'], [1, 3]]]);
  });
  it('marks dropped keys, and keeps dots in keys intact', () => {
    expect(diffPaths({ advance: { 'Science(St. Louis)': 2, Law: 1 } }, { advance: { Law: 1 } }))
      .toEqual([[['advance', 'Science(St. Louis)'], REMOVED]]);
  });
  it('sets the whole value when the old one is missing or not an object', () => {
    expect(diffPaths(null, { hp: 1 }, ['live'])).toEqual([[['live'], { hp: 1 }]]);
    expect(diffPaths(undefined, { hp: 1 })).toEqual([[[], { hp: 1 }]]);
  });
});

describe('setDelta', () => {
  it('lists only what this writer added and removed', () => {
    expect(setDelta(['Law', 'Dodge'], ['Dodge', 'HUMINT'])).toEqual({ add: ['HUMINT'], remove: ['Law'] });
  });
  it('treats a missing old value as empty', () => {
    expect(setDelta(undefined, ['Law'])).toEqual({ add: ['Law'], remove: [] });
  });
});

describe('mergeRemote', () => {
  const base = { hp: 11, wp: 10, checked: ['Alertness'], spent: { rest: false, sleep: false } };
  it('takes what someone else changed', () => {
    expect(mergeRemote(base, base, { ...base, hp: 4 })).toEqual({ ...base, hp: 4 });
  });
  it('keeps both sides when they changed different leaves', () => {
    expect(mergeRemote(base, { ...base, wp: 8 }, { ...base, hp: 4, checked: ['Alertness', 'Firearms'] }))
      .toEqual({ ...base, hp: 4, wp: 8, checked: ['Alertness', 'Firearms'] });
  });
  it('keeps the local value when both changed the same leaf', () => {
    expect(mergeRemote(base, { ...base, hp: 10 }, { ...base, hp: 4 })).toEqual({ ...base, hp: 10 });
  });
  it('merges inside nested objects and drops removed keys', () => {
    const b = { advance: { Law: 1, Drive: 2 }, spent: { rest: false, sleep: false } };
    expect(mergeRemote(b, { ...b, spent: { rest: true, sleep: false } }, { ...b, advance: { Law: 1 }, spent: { rest: false, sleep: true } }))
      .toEqual({ advance: { Law: 1 }, spent: { rest: true, sleep: true } });
  });
});
