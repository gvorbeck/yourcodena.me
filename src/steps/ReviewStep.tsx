import { STATS, STAT_NAMES } from '../rules/data/creation';
import { activeBonds, derived, disorderOf, featureOf, motivationsOf, professionOf, veteranOf, blocking, type Issue } from '../rules';
import { asciiSheet } from '../model/sheet';
import { DETAIL_FIELDS, exportJson } from '../model/character';
import { Btn, SkillTable, Rule, type StepProps } from '../ui';
import { CopyButton } from '../ui/bits';

export function ReviewStep({ c, issues }: StepProps & { issues: Issue[] }) {
  const done = blocking(issues).length === 0;
  const d = derived(c);
  const p = professionOf(c);
  const det = c.details;
  return (
    <>
      <div className="row noprint">
        <Btn onPress={() => window.print()}>Print / PDF</Btn>
        <Btn onPress={() => exportJson(c)}>Export JSON</Btn>
        <CopyButton text={() => asciiSheet(c)} label="Copy Text" ok="Copied ✓" />
      </div>
      {issues.length > 0 && (
        <ul className="issues noprint">{issues.map((i, n) => <li key={n}>[{i.step}] {i.msg}</li>)}</ul>
      )}
      <div className="dossier">
        <Rule />
        <h2>Personnel file {done ? <span className="stamp ok">Cleared</span> : <span className="stamp">Incomplete</span>}</h2>
        <div className="cols">
          <p>Name: {det.name || '—'}{det.codename && ` (codename ${det.codename})`}</p>
          <p>Profession: {p?.name ?? '—'}</p>
          {(det.employer || det.rank) && <p>Employer: {det.employer || '—'} {det.rank && `(${det.rank})`}</p>}
          {(det.age || det.sex || det.nationality) && <p>{[['Age', det.age], ['Sex', det.sex], ['Nationality', det.nationality]].filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(' · ')}</p>}
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
        {Object.keys(c.adjust).length > 0 && <p><span className="dim">Handler adjustments (±):</span> {Object.entries(c.adjust).map(([k, n]) => `${k} ${n > 0 ? '+' : ''}${n}`).join(', ')}</p>}
        <h3>Bonds</h3>
        <ul>{activeBonds(c).map((b) => <li key={b.i}>{b.name} — {d.bondScore}{b.note && ` · ${b.note}`}</li>)}</ul>
        {disorderOf(c) && <p><span className="dim">disorder:</span> {disorderOf(c)}</p>}
        {motivationsOf(c).length > 0 && <>
          <h3>Motivations</h3>
          <ul>{motivationsOf(c).map((m, i) => <li key={i}>{m}</li>)}</ul>
        </>}
        {DETAIL_FIELDS.filter((f) => f.prose && det[f.key]).map((f) => (
          <p key={f.key}><span className="dim">{f.label}:</span> {det[f.key]}</p>
        ))}
        <h3>Incidents of SAN loss without going insane</h3>
        {([['Violence', 'v'], ['Helplessness', 'h']] as const).map(([label, kind]) => (
          <p key={label} className="boxes">{label} ☐ ☐ ☐ · adapted {veteranOf(c)?.adapts === kind ? '☒' : '☐'}</p>
        ))}
      </div>
    </>
  );
}
