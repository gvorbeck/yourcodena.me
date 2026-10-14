import { Button, Checkbox, Input, Label, NumberField, Radio, RadioGroup, TextArea, TextField } from 'react-aria-components';
import type { ReactNode } from 'react';
import type { Character } from '../model/character';
import { SKILL_FAMILIES, TYPED_SKILLS, TYPE_SUGGESTIONS, familyOf, makeKey, typeOf } from '../rules/data/skills';
import { skillsOf } from '../rules';

export type Up = (fn: (draft: Character) => void) => void;
export interface StepProps { c: Character; up: Up }

export const Win = ({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) => (
  <section className="win">
    <header><span>{title}</span><span>{right}</span></header>
    <div className="body">{children}</div>
  </section>
);

export const Rule = () => <div className="rule" aria-hidden />;

export const Text = ({ label, value, onChange, area }: { label: string; value: string; onChange: (v: string) => void; area?: boolean }) => (
  <TextField className="field" value={value} onChange={onChange}>
    <Label>{label}</Label>
    {area ? <TextArea /> : <Input />}
  </TextField>
);

export const Num = ({ label, value, onChange, min = 3, max = 18 }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number }) => (
  <NumberField className="field" value={value} minValue={min} maxValue={max} onChange={(v) => Number.isFinite(v) && onChange(v)}>
    <Label>{label}</Label>
    <Input />
  </NumberField>
);

export const Btn = ({ children, onPress, disabled }: { children: ReactNode; onPress: () => void; disabled?: boolean }) => (
  <Button className="btn" onPress={onPress} isDisabled={disabled}>{children}</Button>
);

export const Choice = ({ value, children, disabled }: { value: string; children: ReactNode; disabled?: boolean }) => (
  <Radio className="choice radio" value={value} isDisabled={disabled}><span className="mark" />{children}</Radio>
);

export const Pick = ({ id, selected, onChange, children, disabled }: { id: string; selected: boolean; onChange: (v: boolean) => void; children: ReactNode; disabled?: boolean }) => (
  <Checkbox className="choice" id={id} isSelected={selected} onChange={onChange} isDisabled={disabled}><span className="mark" />{children}</Checkbox>
);

export { RadioGroup, Label };

/** Family select + type input; emits "Family(Type)" keys. `""` = unset. */
export function SkillPicker({ label, value, onChange }: { label: string; value: string; onChange: (key: string) => void }) {
  const family = familyOf(value), type = typeOf(value);
  const typed = TYPED_SKILLS.includes(family);
  const listId = `types-${family.replace(/\W/g, '')}`;
  return (
    <div className="field">
      <label>{label}</label>
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <select aria-label={label} value={family} onChange={(e) => onChange(e.target.value)}>
          <option value="">— select —</option>
          {SKILL_FAMILIES.filter((f) => f !== 'Unnatural').map((f) => <option key={f}>{f}</option>)}
        </select>
        {typed && (
          <>
            <input aria-label={`${label} type`} placeholder="type…" list={listId} value={type} onChange={(e) => onChange(makeKey(family, e.target.value))} />
            <datalist id={listId}>{(TYPE_SUGGESTIONS[family] ?? []).map((t) => <option key={t} value={t} />)}</datalist>
          </>
        )}
      </div>
    </div>
  );
}

export function SkillTable({ c, onlyTouched }: { c: Character; onlyTouched?: boolean }) {
  const rows = skillsOf(c).filter((s) => (onlyTouched ? s.professional !== null || s.bonus || s.veteran : s.total > 0));
  return (
    <table>
      <thead><tr><th>Skill</th><th className="num">Total</th></tr></thead>
      <tbody>
        {rows.map((s) => (
          <tr key={s.key}>
            <td className={s.professional !== null ? '' : 'dim'}>{s.key}{s.professional !== null ? ' ▪' : ''}</td>
            <td className="num">{s.total}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
