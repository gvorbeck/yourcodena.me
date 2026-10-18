import { describe, expect, it } from 'vitest';
import { loadCharacter, newCharacter, parseCharacter } from '../model/character';
import { filterSkills, liveOutcome, parseLoss, rollExpr, rollLoss, testOutcome, bondCount, derived, duplicatesKit, kitOf, roll4d6dl, skillsOf, slotsOf, validate } from './index';
import { asciiSheet } from '../model/sheet';
import { PROFESSIONS } from './data/professions';
import { PACKAGES } from './data/creation';

describe('derived attributes', () => {
  it('matches the Handbook example (p. 18)', () => {
    const c = newCharacter();
    c.stats = { ...c.stats, STR: 7, CON: 14, POW: 12 };
    expect(derived(c)).toMatchObject({ hp: 11, wp: 12, san: 60, bp: 48 });
  });
  it('applies Things Man Was Not Meant to Know', () => {
    const c = newCharacter();
    c.stats.POW = 12; c.veteran = 'unnatural';
    expect(derived(c)).toMatchObject({ san: 48, bp: 36, maxSan: 89 });
  });
  it('requires a disorder only with Things Man Was Not Meant to Know', () => {
    const c = newCharacter();
    c.veteran = 'unnatural';
    expect(validate(c).some((i) => /disorder/.test(i.msg))).toBe(true);
    c.disorder = 'Amnesia';
    expect(validate(c).some((i) => /disorder/.test(i.msg))).toBe(false);
    c.veteran = '';
    expect(asciiSheet(c)).not.toContain('Amnesia');
    c.veteran = 'unnatural';
    expect(asciiSheet(c)).toContain('Disorder: Amnesia');
  });
});

describe('data', () => {
  it('parses every profession entry', () => {
    for (const p of PROFESSIONS) expect(() => slotsOf(p), p.id).not.toThrow();
  });
  it('packages list eight skills', () => {
    for (const k of PACKAGES) expect(k.skills, k.id).toHaveLength(8);
  });
  it('4d6 drop lowest stays in 3–18', () => {
    for (let i = 0; i < 200; i++) expect(roll4d6dl()).toBeGreaterThanOrEqual(3);
  });
});

describe('skills', () => {
  it('stacks bonus points on professional ratings and base ratings', () => {
    const c = newCharacter();
    c.professionId = 'police-officer';
    c.bonus = ['Alertness', 'Alertness', 'Occult', '', '', '', '', ''];
    const s = Object.fromEntries(skillsOf(c).map((l) => [l.key, l.total]));
    expect(s.Alertness).toBe(99);// 60 + 40 caps at 99; validate() flags >80
    expect(s.Occult).toBe(30);
    expect(validate(c).some((i) => i.msg.includes('Alertness exceeds'))).toBe(true);
  });
});

describe('ascii sheet', () => {
  it('never exceeds 30 columns', async () => {
    const { asciiSheet, MAX_COL } = await import('../model/sheet');
    const c = newCharacter();
    c.professionId = 'police-officer';
    c.veteran = 'violence';
    c.details.name = 'Bartholomew Montgomery-Featherstonehaugh';
    c.details.appearance = 'A petite blonde with short hair, the world has not been kind to her. Supercalifragilisticexpialidocious.';
    c.bonds = [{ name: 'My ex-husband, Jack', note: 'a very long note about the bond' }];
    c.bonus = ['Science(Chemistry)', 'Foreign Language(Mandarin)', 'Occult', '', '', '', '', ''];
    const out = asciiSheet(c);
    for (const l of out.split('\n')) expect(l.length, l).toBeLessThanOrEqual(MAX_COL);
    expect(out).toContain('Violence:');
  });
});

describe('professional skill duplicates (p. 20)', () => {
  it('flags an optional pick that repeats a fixed skill, and duplicatesKit spots it', () => {
    for (const p of PROFESSIONS) {
      const { options } = slotsOf(p);
      const c = newCharacter();
      c.professionId = p.id;
      const dup = options.find((o) => duplicatesKit(c, o));
      if (!dup) continue;
      c.picks = [dup.id];
      expect(kitOf(c).length).toBeGreaterThan(0);
      expect(validate(c).some((i) => i.msg.includes('appears twice')), p.id).toBe(true);
      return;
    }
    throw new Error('no profession with a duplicating option — data or rule changed');
  });
});

describe('damaged veterans (p. 38)', () => {
  it('Extreme Violence drops CHA, bond scores and SAN', () => {
    const c = newCharacter();
    c.stats.CHA = 12; c.stats.POW = 12; c.veteran = 'violence';
    expect(derived(c)).toMatchObject({ cha: 9, bondScore: 9, san: 55 });
  });
  it('Hard Experience removes a bond and wants five +10% skills', () => {
    const c = newCharacter();
    c.professionId = 'police-officer';
    const before = bondCount(c);
    c.veteran = 'hard';
    expect(bondCount(c)).toBe(before - 1);
    expect(validate(c).some((i) => i.msg.includes('pick 5 skills'))).toBe(true);
    c.veteranSkills = ['Alertness', 'Law', 'Stealth', 'Search', 'Drive'];
    expect(validate(c).some((i) => i.msg.includes('pick 5 skills'))).toBe(false);
    expect(validate(c).some((i) => i.msg.includes('past 90%'))).toBe(false);
    c.bonus = ['Alertness', 'Alertness', 'Alertness', 'Alertness', '', '', '', '']; // 20 + 80 + 10 > 90
    expect(validate(c).some((i) => i.msg.includes('Alertness exceeds 90%'))).toBe(true);
  });
});

describe('persistence', () => {
  it('round-trips and rejects bad files', () => {
    const c = newCharacter();
    expect(parseCharacter(JSON.parse(JSON.stringify(c)))).toEqual(c);
    expect(() => parseCharacter({ version: 1, stats: {} })).toThrow();
    expect(() => parseCharacter(null)).toThrow();
  });
  it('keeps a backup when the saved Agent is unreadable', () => {
    const store: Record<string, string> = { 'dg.character': '{"version":1,"stats":"broken"}' };
    (globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; } };
    expect(loadCharacter()).toEqual(newCharacter());
    expect(store['dg.character.bak']).toBe('{"version":1,"stats":"broken"}');
    delete (globalThis as any).localStorage;
  });
});

describe('test outcomes (p. 44)', () => {
  it('matches the 50% skill examples', () => {
    for (const r of [1, 11, 22, 33, 44]) expect(testOutcome(r, 50)).toBe('critical success');
    for (const r of [55, 66, 77, 88, 99, 100]) expect(testOutcome(r, 50)).toBe('fumble');
    expect([50, 49, 10].map((r) => testOutcome(r, 50))).toEqual(['success', 'success', 'success']);
    expect([51, 57, 90].map((r) => testOutcome(r, 50))).toEqual(['failure', 'failure', 'failure']);
    expect([testOutcome(80, 80), testOutcome(81, 80)]).toEqual(['success', 'failure']);
  });
  it('fumbles 100 and crits 01 at any chance', () => {
    expect(testOutcome(100, 100)).toBe('fumble');
    expect(testOutcome(1, 1)).toBe('critical success');
    expect(testOutcome(99, 99)).toBe('critical success');
  });
});

describe('play-time modifiers', () => {
  it('applies the low-WP penalty and the 0-WP lockout (p. 47)', () => {
    expect(liveOutcome(40, 50, 10)).toMatchObject({ chance: 50, outcome: 'success' });
    expect(liveOutcome(40, 50, 2)).toMatchObject({ chance: 30, pen: 20, outcome: 'failure' });
    expect(liveOutcome(1, 50, 0).outcome).toBe('failure');
    expect(liveOutcome(55, 50, 0).outcome).toBe('fumble');
  });
  it('rolls dice notation and parses success/failure losses', () => {
    expect(rollExpr('1D6+2', () => 0.99)).toBe(8);
    expect(rollExpr('3')).toBe(3);
    expect(rollExpr('x')).toBeNull();
    expect(parseLoss('0/1D4')).toEqual(['0', '1D4']);
    expect(parseLoss('1D4')).toBeNull();
  });
});

describe('SAN loss with extra victims (p. 67)', () => {
  it('caps the failure die plus victims at the die maximum', () => {
    expect(rollLoss('1D6+5', () => 0.99)).toBe(6);
    expect(rollLoss('1D6+2', () => 0)).toBe(3);
    expect(rollLoss('1D4+9', () => 0.5)).toBe(4);
    expect(rollLoss('1')).toBe(1);
    expect(rollLoss('x')).toBeNull();
  });
});

describe('skill search', () => {
  const lines = [{ key: 'Firearms' }, { key: 'First Aid' }, { key: 'Foreign Language(Mandarin)' }] as Parameters<typeof filterSkills>[0];
  it('matches any part of the name, case-insensitively, including the type', () => {
    expect(filterSkills(lines, 'FIR').map((s) => s.key)).toEqual(['Firearms', 'First Aid']);
    expect(filterSkills(lines, 'mandarin')).toHaveLength(1);
    expect(filterSkills(lines, 'zzz')).toHaveLength(0);
    expect(filterSkills(lines, '  ')).toBe(lines);
  });
});
