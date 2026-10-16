import { useState } from 'react';
import { STATS, STAT_NAMES } from '../rules/data/creation';
import { bondCount, derived, disorderOf, featureOf, professionOf, validate } from '../rules';
import { asciiSheet } from '../model/sheet';
import { exportJson } from '../model/character';
import { Btn, SkillTable, Rule, type StepProps } from '../ui';

export function ReviewStep({ c }: StepProps) {
  const [copied, setCopied] = useState(false);
  const issues = validate(c);
  const d = derived(c);
  const p = professionOf(c);
  const det = c.details;
  return (
    <>
      <div className="row noprint">
        <Btn onPress={() => window.print()}>Print / PDF</Btn>
        <Btn onPress={() => exportJson(c)}>Export JSON</Btn>
        <Btn onPress={() => { navigator.clipboard.writeText(asciiSheet(c)).then(() => setCopied(true), () => alert('Clipboard unavailable.')); setTimeout(() => setCopied(false), 1500); }}>{copied ? 'Copied ✓' : 'Copy Text'}</Btn>
      </div>
      {issues.length > 0 && (
        <ul className="issues noprint">{issues.map((i, n) => <li key={n}>[{i.step}] {i.msg}</li>)}</ul>
      )}
      <div className="dossier">
        <Rule />
        <h2>Personnel file {issues.length ? <span className="stamp">Incomplete</span> : <span className="ok">Cleared</span>}</h2>
        <div className="cols">
          <p>Name: {det.name || '—'}{det.codename && ` (codename ${det.codename})`}</p>
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
        <ul>{c.bonds.slice(0, bondCount(c)).filter((b) => b.name).map((b, i) => <li key={i}>{b.name} — {d.bondScore}{b.note && ` · ${b.note}`}</li>)}</ul>
        {disorderOf(c) && <p><span className="dim">disorder:</span> {disorderOf(c)}</p>}
        <h3>Motivations</h3>
        <ul>{c.motivations.filter(Boolean).map((m, i) => <li key={i}>{m}</li>)}</ul>
        {(['education', 'appearance', 'personality', 'admires', 'dislikes', 'trust', 'helps'] as const).map((k) => det[k] && (
          <p key={k}><span className="dim">{k}:</span> {det[k]}</p>
        ))}
        <h3>Incidents of SAN loss without going insane</h3>
        {([['Violence', 'violence'], ['Helplessness', 'captivity']] as const).map(([label, vet]) => (
          <p key={label} className="boxes">{label} ☐ ☐ ☐ · adapted {c.veteran === vet ? '☒' : '☐'}</p>
        ))}
      </div>
    </>
  );
}
