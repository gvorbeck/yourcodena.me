import { PROFESSIONS, GROUP_LABEL, POSTINGS, type Group } from '../rules/data/professions';
import { PACKAGES } from '../rules/data/creation';
import { BONUS_PICKS, BONUS_POINTS, MAX_CREATION_SKILL } from '../rules/data/skills';
import { duplicatesKit, professionOf, slotsOf, type Alt, type Slot } from '../rules';
import { Choice, Pick, RadioGroup, Label, Rule, SkillPicker, SkillTable, TypeInput, type StepProps } from '../ui';

const altLabel = (a: Alt) => `${a.family}${a.type ? `(${a.type})` : a.askType ? ' (type)' : ''} ${a.rating}%`;

export function ProfessionStep({ c, up }: StepProps) {
  const p = professionOf(c);
  const kit = p && slotsOf(p);
  const setType = (slot: string, v: string) => up((d) => { d.types[slot] = v; });

  const typeInput = (slot: string, alt: Alt) =>
    alt.askType ? <TypeInput label={`${alt.family} type`} family={alt.family} value={c.types[slot] ?? ''} onChange={(v) => setType(slot, v)} style={{ width: '12rem', marginLeft: '.5rem', display: 'inline-block' }} /> : null;

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

  const postings = POSTINGS.filter((x) => p && x.professions.includes(p.id));

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
          </div>
        </RadioGroup>

        <div>
          {!p || !kit ? <p className="dim">Select a profession.</p> : (
            <>
              <h3>{p.name}</h3>
              <p className="dim">{p.page}{p.stats.length ? ` · recommended ${p.stats.join(', ')} ≥ 10` : ''} · {p.bonds} bond{p.bonds === 1 ? '' : 's'}</p>
              <h3>Professional skills</h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>{kit.fixed.map(fixedSlot)}</ul>
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
        <select id="pkg" style={{ width: 'auto', maxWidth: '100%' }} value={c.bonusPackage}
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
      <div className="grid" style={{ marginTop: '.5rem' }}>
        {c.bonus.map((k, i) => <SkillPicker key={i} label={`Bonus ${i + 1} (+${BONUS_POINTS})`} value={k} onChange={(v) => up((d) => { d.bonus[i] = v; })} />)}
      </div>
      <h3>Skills so far</h3>
      <div className="cols"><SkillTable c={c} onlyTouched /></div>
    </>
  );
}
