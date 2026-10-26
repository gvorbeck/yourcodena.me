import { describe, expect, it } from 'vitest';
import { REMOVED, diffPaths, setDelta } from './diff';

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
