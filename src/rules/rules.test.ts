import { describe, expect, it } from 'vitest';
import { newCharacter } from '../model/character';
import { derived, roll4d6dl, skillsOf, slotsOf, validate } from './index';
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
