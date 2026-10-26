import { useState } from 'react';
import { PROFESSIONS, GROUP_LABEL, POSTINGS, type Group } from '../rules/data/professions';
import { PACKAGES } from '../rules/data/creation';
import { BONUS_PICKS, BONUS_POINTS, MAX_CREATION_SKILL, TYPED_SKILLS, TYPE_SUGGESTIONS, baseRating, familyOf, typeOf } from '../rules/data/skills';
import { CUSTOM_ID, CUSTOM_MAX_RATING, customBudget, duplicatesKit, professionOf, slotsOf, type Alt, type Slot } from '../rules';
import { Btn, Choice, Num, Pick, RadioGroup, Label, Rule, SkillPicker, SkillTable, Text, TypeInput, type StepProps } from '../ui';

const altLabel = (a: Alt) => `${a.family}${a.type ? `(${a.type})` : a.askType ? ' (type)' : ''} ${a.rating}%`;

export function ProfessionStep({ c, up }: StepProps) {
  const p = professionOf(c);
  const kit = p && slotsOf(p);
  const [adjusting, setAdjusting] = useState(''); // skill being picked; added once a typed skill has its type
  const setType = (slot: string, v: string) => up((d) => { d.types[slot] = v; });

  const typeInput = (slot: string, alt: Alt) =>
    alt.askType ? <TypeInput label={`${alt.family} type`} suggestions={TYPE_SUGGESTIONS[alt.family] ?? []} value={c.types[slot] ?? ''} onChange={(v) => setType(slot, v)} inline /> : null;

  const fixedSlot = (s: Slot) =>
    s.alts.length === 1 ? (
      <li key={s.id}>{altLabel(s.alts[0])}{typeInput(s.id, s.alts[0])}</li>
    ) : (
      <li key={s.id}>
        <RadioGroup aria-label="Either/or" value={String(c.orPicks[s.id] ?? 0)} onChange={(v) => up((d) => { d.orPicks[s.id] = Number(v); d.picks = d.picks.filter((id) => !duplicatesKit(d, kit!.options.find((o) => o.id === id)!)); })}>
          {s.alts.map((a, i) => <Choice key={i} value={String(i)}>{altLabel(a)}</Choice>)}
        </RadioGroup>
        {typeInput(s.id, s.alts[c.orPicks[s.id] ?? 0])}
      </li>
    );

  const budget = customBudget(c.custom.bonds), left = budget - c.custom.points.reduce((a, b) => a + b, 0);
  const postings =POSTINGS.filter((x) => p && x.professions.includes(p.id));

  return (
    <>
      <p className="dim">Handbook pp. 20–28, 106–163 — a profession replaces base ratings with its kit and sets your Bonds. Then spend 8 × +{BONUS_POINTS}% bonus points (max {MAX_CREATION_SKILL}%).</p>
      <Rule />
      <div className="grid split">
        <RadioGroup
          value={c.professionId}
          onChange={(v) => up((d) => { d.professionId = v; d.orPicks = {}; d.picks = []; d.types = {}; })}
        >
          <Label className="lbl">Profession ({PROFESSIONS.length})</Label>
          <div className="group-list">
            {(['core', 'additional', 'agency'] as Group[]).map((g) => (
              <div key={g}>
                <h3>{GROUP_LABEL[g]}</h3>
                {PROFESSIONS.filter((x) => x.group === g).map((x) => (
                  <Choice key={x.id} value={x.id}>{x.name} <span className="dim">· {x.bonds}B</span></Choice>
                ))}
              </div>
            ))}
            <div>
              <h3>Your own</h3>
              <Choice value={CUSTOM_ID}>Build a new profession <span className="dim">· p. 26</span></Choice>
            </div>
          </div>
        </RadioGroup>

        <div>
          {c.professionId === CUSTOM_ID ? (
            <>
              <h3>New profession</h3>
              <Text label="Name" value={c.custom.name} max={100} onChange={(v) => up((d) => { d.custom.name = v; })} />
              <div className="row mt-s">
                <label className="lbl" htmlFor="cp-bonds">Bonds</label>
                <select id="cp-bonds" className="auto-width" value={c.custom.bonds} onChange={(e) => up((d) => { d.custom.bonds = Number(e.target.value); })}>
                  {[1, 2, 3, 4].map((n) => <option key={n}>{n}</option>)}
                </select>
                <span className="dim">{budget} points · <span className={left === 0 ? 'ok' : 'warn'}>{left} left</span> · max {CUSTOM_MAX_RATING}% each</span>
              </div>
              {c.custom.skills.map((k, i) => (
                <div key={i} className="row nowrap">
                  <SkillPicker label={`Skill ${i + 1}`} value={k} onChange={(v) => up((d) => { d.custom.skills[i] = v; })} />
                  <Num label={`Points ${i + 1}`} value={c.custom.points[i]} min={0} max={CUSTOM_MAX_RATING} onChange={(v) => up((d) => { d.custom.points[i] = v; })} />
                  {k && <span className="dim">→ {baseRating(k) + c.custom.points[i]}%</span>}
                </div>
              ))}
            </>
          ) : !p || !kit ? <p className="dim">Select a profession.</p> : (
            <>
              <h3>{p.name}</h3>
              <p className="dim">{p.page}{p.stats.length ? ` · recommended ${p.stats.join(', ')} ≥ 10` : ''} · {p.bonds} bond{p.bonds === 1 ? '' : 's'}</p>
              <h3>Professional skills</h3>
              <ul className="plain-list">{kit.fixed.map(fixedSlot)}</ul>
              {kit.n > 0 && (
                <>
                  <h3>Choose {kit.n} <span className={c.picks.length === kit.n ? 'ok' : 'warn'}>({c.picks.length}/{kit.n})</span></h3>
                  {kit.options.map((o) => {
                    const on = c.picks.includes(o.id);
                    const have = !on && duplicatesKit(c, o);
                    return (
                      <div key={o.id}>
                        <Pick id={o.id} selected={on} disabled={!on && (have || c.picks.length >= kit.n)}
                          onChange={(v) => up((d) => { d.picks = v ? [...d.picks, o.id] : d.picks.filter((x) => x !== o.id); })}>
                          {o.alts.map(altLabel).join(' / ')}{have && <span className="dim"> · already have</span>}
                        </Pick>
                        {on && typeInput(o.id, o.alts[0])}
                      </div>
                    );
                  })}
                </>
              )}
              {postings.length > 0 && (
                <>
                  <h3>Posting suggestions</h3>
                  {postings.map((x) => <p key={x.unit} className="dim">{x.agency} {x.unit} ({x.page}): {x.bonus.join(', ')}</p>)}
                </>
              )}
            </>
          )}
        </div>
      </div>

      <h3>Bonus skill points</h3>
      <div className="row">
        <label className="lbl" htmlFor="pkg">Package (p. 27)</label>
        <select id="pkg" className="auto-width" value={c.bonusPackage}
          onChange={(e) => up((d) => {
            d.bonusPackage = e.target.value;
            const pk = PACKAGES.find((k) => k.id === e.target.value);
            if (pk) d.bonus = pk.skills.map((s) => (s === '?' ? '' : s.replace('*', '')));
          })}>
          <option value="">— custom —</option>
          {PACKAGES.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
        </select>
        <span className="dim">Pick {BONUS_PICKS}; repeats stack. Not Unnatural.</span>
      </div>
      <div className="grid mt-s">
        {c.bonus.map((k, i) => <SkillPicker key={i} label={`Bonus ${i + 1} (+${BONUS_POINTS})`} value={k} onChange={(v) => up((d) => { d.bonus[i] = v; })} />)}
      </div>
      <h3>Handler adjustments</h3>
      <p className="dim">Agreed fudges, added to the skill's total (±99). Marked ± on the sheet; a positive one skips the 80% warning.</p>
      {Object.entries(c.adjust).map(([k, n]) => (
        <div key={k} className="row adjust">
          <span>{k}</span>
          <Num label={`${k} adjustment`} value={n} min={-99} max={99} onChange={(v) => up((d) => { d.adjust[k] = v; })} />
          <Btn onPress={() => up((d) => { delete d.adjust[k]; })}>Remove</Btn>
        </div>
      ))}
      <SkillPicker label="Adjust skill" value={adjusting} onChange={(k) => {
        if (!k || (TYPED_SKILLS.includes(familyOf(k)) && !typeOf(k))) return setAdjusting(k);
        setAdjusting('');
        up((d) => { d.adjust[k] ??= 10; });
      }} />
      <h3>Skills so far</h3>
      <div className="cols"><SkillTable c={c} onlyTouched /></div>
    </>
  );
}
