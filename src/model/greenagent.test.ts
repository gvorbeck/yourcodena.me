import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseCharacter } from './character';
import { fromGreenAgent } from './greenagent';
import { skillsOf } from '../rules';

describe('Green Agent import', () => {
  it('converts a custom-profession export', () => {
    const raw = JSON.parse(readFileSync('src/model/fixtures/green-agent-custom.json', 'utf8'));
    const c = parseCharacter(fromGreenAgent(raw));
    const t = Object.fromEntries(skillsOf(c).map((s) => [s.key, s.total]));
    expect(c.details.name).toBe('Larry Stapler');
    expect(c.custom.skills.filter(Boolean)).toHaveLength(10);
    expect(t['Craft(Lockpicking)']).toBe(75);
    expect(t['Persuade']).toBe(70);
    expect(t['Occult']).toBe(15); // 13th-skill overflow lands in adjust: Alertness 30
    expect(t['Alertness']).toBe(30);
  });
});
