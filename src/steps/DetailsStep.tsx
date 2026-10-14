import { VETERANS } from '../rules/data/creation';
import { veteranOf, professionOf } from '../rules';
import * as R from '../rules/data/random';
import { Choice, Rule, RadioGroup, Label, SkillPicker, Text, type StepProps } from '../ui';

const FIELDS: [keyof StepProps['c']['details'], string, boolean?][] = [
  ['name', 'Name'], ['codename', 'Codename (optional)'], ['age', 'Age / date of birth'], ['sex', 'Sex'], ['nationality', 'Nationality'],
  ['employer', 'Employer'], ['rank', 'Profession / rank'],
  ['education', 'Education and occupational history', true], ['appearance', 'Physical description', true],
  ['personality', 'Personality', true], ['admires', 'Something admired', true], ['dislikes', 'Something disliked', true],
  ['trust', 'Why Delta Green trusts this Agent', true], ['helps', 'Why this Agent helps Delta Green', true],
];

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

export function DetailsStep({ c, up }: StepProps) {
  const v = veteranOf(c);
  const p = professionOf(c);
  const roll: Partial<Record<keyof StepProps['c']['details'], () => string>> = {
    name: () => `${pick(R.FIRST)} ${pick(R.LAST)}`, codename: () => pick(R.CODENAMES), age: () => String(24 + Math.floor(Math.random() * 40)),
    sex: () => pick(['Female', 'Male', 'Nonbinary']), nationality: () => pick(R.NATIONALITIES),
    appearance: () => pick(R.APPEARANCE), personality: () => pick(R.PERSONALITY), admires: () => pick(R.ADMIRES), dislikes: () => pick(R.DISLIKES), trust: () => pick(R.TRUST), helps: () => pick(R.HELPS),
    ...(p && { rank: () => p.name, education: () => `Trained and worked as ${p.name.toLowerCase()}.` }),
  };
  const rollMotivation = (i: number) => up((d) => {
    const m = [...d.motivations]; while (m.length < 5) m.push('');
    m[i] = pick(R.MOTIVATIONS.filter((x) => !m.includes(x)));
    d.motivations = m;
  });
  return (
    <>
      <p className="dim">Handbook pp. 36–38 — who the Agent is, what drives them, and optionally what the work has already cost them.</p>
      <Rule />
      <div className="grid wide">
        {FIELDS.map(([k, label, area]) => (
          <Text key={k} label={label} area={area} onRoll={roll[k] && (() => up((d) => { d.details[k] = roll[k]!(); }))} value={c.details[k]} onChange={(x) => up((d) => { d.details[k] = x; })} />
        ))}
      </div>
      <h3>Motivations (up to five)</h3>
      <div className="grid wide">
        {Array.from({ length: 5 }, (_, i) => (
          <Text key={i} label={`Motivation ${i + 1}`} onRoll={() => rollMotivation(i)} value={c.motivations[i] ?? ''}
            onChange={(x) => up((d) => { const m = [...d.motivations]; while (m.length < 5) m.push(''); m[i] = x; d.motivations = m; })} />
        ))}
      </div>
      <h3>Damaged veterans (p. 38) — optional</h3>
      <RadioGroup value={c.veteran || 'none'} onChange={(x) => up((d) => { d.veteran = x === 'none' ? '' : x; d.veteranSkills = []; })}>
        <Label className="lbl">Choose one or none</Label>
        <Choice value="none">None</Choice>
        {VETERANS.map((o) => <Choice key={o.id} value={o.id}>{o.name} <span className="dim">— {o.effects.join('; ')}</span></Choice>)}
      </RadioGroup>
      {v?.extraSkills && (
        <div className="grid" style={{ marginTop: '.5rem' }}>
          {Array.from({ length: v.extraSkills.count }, (_, i) => (
            <SkillPicker key={i} label={`+${v.extraSkills!.amount}% skill ${i + 1}`} value={c.veteranSkills[i] ?? ''}
              onChange={(x) => up((d) => { const s = [...d.veteranSkills]; while (s.length < v.extraSkills!.count) s.push(''); s[i] = x; d.veteranSkills = s; })} />
          ))}
        </div>
      )}
    </>
  );
}
