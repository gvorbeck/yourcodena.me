import { useRef } from 'react';
import { STATS, STAT_NAMES } from '../rules/data/creation';
import { derived, featureOf, professionOf, validate } from '../rules';
import { exportJson, importJson, type Character } from '../model/character';
import { Btn, SkillTable, Rule, type StepProps } from '../ui';

export function ReviewStep({ c, up, replace }: StepProps & { replace: (c: Character) => void }) {
  const file = useRef<HTMLInputElement>(null);
  const issues = validate(c);
  const d = derived(c);
  const p = professionOf(c);
  const det = c.details;
  return (
    <>
      <div className="row noprint">
        <Btn onPress={() => window.print()}>Print / PDF</Btn>
        <Btn onPress={() => exportJson(c)}>Export JSON</Btn>
        <Btn onPress={() => file.current?.click()}>Import JSON</Btn>
        <input ref={file} type="file" accept=".json,application/json" hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try { replace(await importJson(f)); } catch { alert('Not a valid Agent file.'); }
          }} />
      </div>
      {issues.length > 0 && (
        <ul className="issues noprint">{issues.map((i, n) => <li key={n}>[{i.step}] {i.msg}</li>)}</ul>
      )}
      <div className="dossier">
        <Rule />
        <h2>Personnel file {issues.length ? <span className="stamp">Incomplete</span> : <span className="ok">Cleared</span>}</h2>
        <div className="cols">
          <p>Name: {det.name || '—'}</p>
          <p>Profession: {p?.name ?? '—'}</p>
          <p>Employer: {det.employer || '—'} {det.rank && `(${det.rank})`}</p>
          <p>Age: {det.age || '—'} · Sex: {det.sex || '—'} · Nationality: {det.nationality || '—'}</p>
        </div>
        <h3>Statistics</h3>
        <table>
          <tbody>
            {STATS.map((s) => (
              <tr key={s}><td>{s} {STAT_NAMES[s]}</td><td className="num">{c.stats[s]}</td><td className="num">×5 = {c.stats[s] * 5}%</td><td className="dim">{featureOf(s, c.stats[s])}</td></tr>
            ))}
          </tbody>
        </table>
        <p>HP {d.hp} · WP {d.wp} · SAN {d.san}/{d.maxSan} · BP {d.bp}</p>
        <h3>Skills</h3>
        <div className="cols"><SkillTable c={c} /></div>
        <h3>Bonds</h3>
        <ul>{c.bonds.filter((b) => b.name).map((b, i) => <li key={i}>{b.name} — {d.bondScore}{b.note && ` · ${b.note}`}</li>)}</ul>
        <h3>Motivations</h3>
        <ul>{c.motivations.filter(Boolean).map((m, i) => <li key={i}>{m}</li>)}</ul>
        {(['education', 'appearance', 'personality', 'admires', 'dislikes', 'trust', 'helps'] as const).map((k) => det[k] && (
          <p key={k}><span className="dim">{k}:</span> {det[k]}</p>
        ))}
      </div>
    </>
  );
}
