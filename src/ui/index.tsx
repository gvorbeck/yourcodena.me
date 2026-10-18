import { Button, Checkbox, ComboBox, ComboBoxStateContext, Input, Label, ListBox, ListBoxItem, NumberField, Popover, Radio, RadioGroup, TextArea, TextField } from 'react-aria-components';
import { useContext, type CSSProperties, type ReactNode } from 'react';
export { Win } from './Win';
import type { Character } from '../model/character';
import { SKILL_FAMILIES, TYPED_SKILLS, TYPE_SUGGESTIONS, familyOf, makeKey, typeOf } from '../rules/data/skills';
import { filterSkills, skillsOf } from '../rules';

export type Up = (fn: (draft: Character) => void) => void;
export interface StepProps { c: Character; up: Up }

export const Rule = () => <div className="rule" aria-hidden />;

/** 8x8 pixel d6 showing five; drawn on a grid so it stays crisp at any size. */
const Dice = () => (
  <svg viewBox="0 0 8 8" width="16" height="16" shapeRendering="crispEdges" aria-hidden fill="currentColor">
    <path d="M1 0h6v1h1v6h-1v1H1V7H0V1h1z M2 2h1v1H2z M5 2h1v1H5z M3.5 3.5h1v1h-1z M2 5h1v1H2z M5 5h1v1H5z" fillRule="evenodd" />
  </svg>
);

export const Text = ({ label, value, onChange, area, onRoll }: { label: string; value: string; onChange: (v: string) => void; area?: boolean; onRoll?: () => void }) => (
  <TextField className="field" value={value} onChange={onChange}>
    <Label>{label}</Label>
    <div className="with-roll">
      {area ? <TextArea /> : <Input />}
      {onRoll && <Button className="btn roll" aria-label={`Randomize ${label}`} onPress={onRoll}><Dice /></Button>}
    </div>
  </TextField>
);

export const Num = ({ label, value, onChange, min = 3, max = 18 }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number }) => (
  <NumberField className="field" value={value} minValue={min} maxValue={max} onChange={(v) => Number.isFinite(v) && onChange(v)}>
    <Label>{label}</Label>
    <Input />
  </NumberField>
);

export const Btn = ({ children, onPress, disabled, className }: { children: ReactNode; onPress: () => void; disabled?: boolean; className?: string }) => (
  <Button className={className ? `btn ${className}` : 'btn'} onPress={onPress} isDisabled={disabled}>{children}</Button>
);

export const Choice = ({ value, children, disabled }: { value: string; children: ReactNode; disabled?: boolean }) => (
  <Radio className="choice radio" value={value} isDisabled={disabled}><span className="mark" />{children}</Radio>
);

export const Pick = ({ id, selected, onChange, children, disabled }: { id: string; selected: boolean; onChange: (v: boolean) => void; children: ReactNode; disabled?: boolean }) => (
  <Checkbox className="choice" id={id} isSelected={selected} onChange={onChange} isDisabled={disabled}><span className="mark" />{children}</Checkbox>
);

export { RadioGroup, Label };

/** Opens the list on click; keyboard focus alone (tabbing past) stays quiet. */
const ClickInput = () => {
  const state = useContext(ComboBoxStateContext);
  return <Input placeholder="type…" onClick={() => state?.open(null, 'manual')} />;
};

/** Free-text input with suggestions. A real ComboBox (not <datalist>) so the popup can be styled and anchors to the input. */
export const TypeInput = ({ label, suggestions, value, onChange, style }: { label: string; suggestions: string[]; value: string; onChange: (v: string) => void; style?: CSSProperties }) => {
  const items = suggestions.map((id) => ({ id }));
  // A value that already is a suggestion would filter the list down to itself; show everything instead.
  const complete = items.some((i) => i.id.toLowerCase() === value.toLowerCase());
  return (
    <ComboBox aria-label={label} allowsCustomValue inputValue={value} onInputChange={onChange} defaultItems={items} defaultFilter={complete ? () => true : undefined} style={{ flex: 1, minWidth: 0, ...style }}>
      <ClickInput />
      <Popover className="popover">
        <ListBox className="listbox">{(t: { id: string }) => <ListBoxItem className="option">{t.id}</ListBoxItem>}</ListBox>
      </Popover>
    </ComboBox>
  );
};

/** Family select + type input; emits "Family(Type)" keys. `""` = unset. */
export function SkillPicker({ label, value, onChange }: { label: string; value: string; onChange: (key: string) => void }) {
  const family = familyOf(value), type = typeOf(value);
  const typed = TYPED_SKILLS.includes(family);
  return (
    <div className="field">
      <label>{label}</label>
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <select aria-label={label} value={family} onChange={(e) => onChange(e.target.value)} style={{ flex: 1, minWidth: 0, width: 'auto' }}>
          <option value="">— select —</option>
          {SKILL_FAMILIES.filter((f) => f !== 'Unnatural').map((f) => <option key={f}>{f}</option>)}
        </select>
        {typed && <TypeInput label={`${label} type`} suggestions={TYPE_SUGGESTIONS[family] ?? []} value={type} onChange={(v) => onChange(makeKey(family, v))} />}
      </div>
    </div>
  );
}

/** Typed skills break after the family ("Foreign Language" / "(Mandarin)") so a long name is two short lines, not one that wraps unpredictably. */
const skillName = (key: string) => (typeOf(key) ? <>{familyOf(key)}<small className="skilltype">({typeOf(key)})</small></> : key);

export function SkillTable({ c, onlyTouched, onRoll, filter = '', advance, checked = [] }: { c: Character; onlyTouched?: boolean; onRoll?: (label: string, chance: number) => void; filter?: string; advance?: Record<string, number>; checked?: string[] }) {
  const q = filter.trim();
  const rows = filterSkills(skillsOf(c, advance).filter((s) => (onlyTouched ? s.professional !== null || s.bonus || s.veteran : s.total > 0)), q);
  return (
    <table>
      <thead><tr><th>Skill</th><th className="num">Total</th></tr></thead>
      <tbody>
        {rows.map((s) => (
          <tr key={s.key}>
            <td className={s.professional !== null ? '' : 'dim'}>
              <span className="skillname">
                {onRoll ? <button className="rollable" onClick={() => onRoll(s.key, s.total)}>{skillName(s.key)}</button> : <span>{s.key}</span>}
                {s.professional !== null && <span className="mark" title="Professional skill">▪</span>}
                {checked.includes(s.key) && <span className="mark" title="Failed this session">✓<span className="sr-only"> failed this session, will advance</span></span>}
              </span>
            </td>
            <td className="num">{s.total}%</td>
          </tr>
        ))}
        {rows.length === 0 && q && <tr><td className="dim" colSpan={2}>No skill matches “{filter}”.</td></tr>}
      </tbody>
    </table>
  );
}
