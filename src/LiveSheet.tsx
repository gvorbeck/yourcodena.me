import { useEffect, useState } from 'react';
import { STATS, STAT_NAMES } from './rules/data/creation';
import { bondCount, derived, professionOf } from './rules';
import { encodeSheet, type Live } from './model/live';
import type { Character } from './model/character';
import { Btn, SkillTable, Win } from './ui';

function Counter({ label, value, max, onChange }: { label: string; value: number; max?: number; onChange: (v: number) => void }) {
  const set = (v: number) => onChange(Math.max(0, max === undefined ? v : Math.min(max, v)));
  return (
    <div className="row counter" role="group" aria-label={label}>
      <strong style={{ flex: 'none', width: '13ch', overflowWrap: 'anywhere' }}>{label}</strong>
      <Btn onPress={() => set(value - 1)}>−</Btn>
      <output aria-live="polite" style={{ flex: 'none', width: '9ch', textAlign: 'center' }}>{value}{max !== undefined && ` / ${max}`}</output>
      <Btn onPress={() => set(value + 1)}>+</Btn>
    </div>
  );
}

export function LiveSheet({ c, init }: { c: Character; init: Live }) {
  const [l, setL] = useState(init);
  const [copied, setCopied] = useState(false);
  const d = derived(c);
  const link = encodeSheet(c, l);
  // The URL is the save file: replaceState keeps it current without piling up history entries.
  useEffect(() => history.replaceState(null, '', link), [link]);
  const set = <K extends keyof Live>(k: K, v: Live[K]) => setL((p) => ({ ...p, [k]: v }));
  const bonds = c.bonds.slice(0, bondCount(c));

  return (
    <div className="shell live">
      <Win title={`LIVE SHEET // ${(c.details.name || 'UNNAMED').toUpperCase()}`} right={professionOf(c)?.name}>
        <div className="row noprint">
          <Btn onPress={() => { history.replaceState(null, '', location.pathname); location.reload(); }}>&lt; Back to editor</Btn>
          <Btn onPress={() => navigator.clipboard.writeText(location.href).then(() => setCopied(true), () => alert('Clipboard unavailable.')).finally(() => setTimeout(() => setCopied(false), 1500))}>{copied ? 'Link copied ✓' : 'Copy share link'}</Btn>
          <Btn onPress={() => window.print()}>Print / PDF</Btn>
        </div>
        <p className="noprint" style={{ marginBottom: '1.5rem' }}><small>Changes are saved in this page's link. Bookmark it to resume; a copied link is a snapshot, so later changes aren't synced.</small></p>
        <Counter label="HP" value={l.hp} max={d.hp} onChange={(v) => set('hp', v)} />
        <Counter label="WP" value={l.wp} max={d.wp} onChange={(v) => set('wp', v)} />
        <Counter label="SAN" value={l.san} max={d.maxSan} onChange={(v) => set('san', v)} />
        <Counter label="Breaking pt" value={l.bp} onChange={(v) => set('bp', v)} />
        {l.san <= l.bp && <p className="warn">SAN at or below breaking point.</p>}
        <h3>Statistics</h3>
        <table><tbody>{STATS.map((s) => <tr key={s}><td>{s} {STAT_NAMES[s]}</td><td className="num">{c.stats[s]}</td><td className="num">{c.stats[s] * 5}%</td></tr>)}</tbody></table>
        <h3>Bonds</h3>
        {bonds.filter((b) => b.name).map((b, i) => (
          <Counter key={i} label={b.name} value={l.bonds[i] ?? d.bondScore} max={d.bondScore} onChange={(v) => set('bonds', Object.assign([...l.bonds], { [i]: v }))} />
        ))}
        <h3>Notes</h3>
        <textarea aria-label="Notes" rows={6} style={{ width: '100%' }} value={l.notes} onChange={(e) => set('notes', e.target.value)} />
      </Win>
      <Win title="SKILLS"><SkillTable c={c} /></Win>
    </div>
  );
}
