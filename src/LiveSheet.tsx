import { useEffect, useRef, useState } from 'react';
import { STATS, STAT_NAMES } from './rules/data/creation';
import { bondCount, derived, professionOf, rollD100, testOutcome, type Outcome } from './rules';
import { MAX_NOTES, encodeSheet, type Live } from './model/live';
import type { Character } from './model/character';
import { Btn, SkillTable, Win } from './ui';

function Counter({ label, value, max, onChange, onRoll }: { label: string; value: number; max?: number; onChange: (v: number) => void; onRoll?: () => void }) {
  const set = (v: number) => onChange(Math.max(0, max === undefined ? v : Math.min(max, v)));
  return (
    <div className="row counter" role="group" aria-label={label}>
      <strong>{onRoll ? <button className="rollable" onClick={onRoll}>{label}</button> : label}</strong>
      <Btn onPress={() => set(value - 1)}>−</Btn>
      <output aria-live="polite">{value}{max !== undefined && ` / ${max}`}</output>
      <Btn onPress={() => set(value + 1)}>+</Btn>
    </div>
  );
}

interface Roll { id: number; label: string; chance: number; roll: number; outcome: Outcome }

export function LiveSheet({ c, init }: { c: Character; init: Live }) {
  const [l, setL] = useState(init);
  const [copied, setCopied] = useState(false);
  const [rolls, setRolls] = useState<Roll[]>([]);
  const nextId = useRef(0);
  const roll = (label: string, chance: number) => {
    const r = rollD100();
    setRolls((p) => [{ id: nextId.current++, label, chance, roll: r, outcome: testOutcome(r, chance) }, ...p].slice(0, 10));
  };
  const d = derived(c);
  const link = encodeSheet(c, l);
  // The URL is the save file. Debounced and guarded: Safari throws past 100 replaceState calls per 30 s.
  useEffect(() => {
    const t = setTimeout(() => { try { history.replaceState(null, '', link); } catch { /* rate limited; next change retries */ } }, 300);
    return () => clearTimeout(t);
  }, [link]);
  const set = <K extends keyof Live>(k: K, v: Live[K]) => setL((p) => ({ ...p, [k]: v }));
  const bonds = c.bonds.slice(0, bondCount(c)).map((b, i) => ({ ...b, i })).filter((b) => b.name);

  return (
    <div className="shell live">
      <div className="rollbar noprint">
        {rolls.length === 0 ? <span className="dim">Click a stat or skill to roll d% against it (at or below passes).</span> : rolls.map((r, i) => (
          <span key={r.id} className={i === 0 ? 'latest' : 'dim'}>
            {r.label} {r.chance}%: <b>{String(r.roll).padStart(2, '0')}</b> {r.outcome.toUpperCase()}
          </span>
        ))}
      </div>
      <p className="sr-only" aria-live="polite">{rolls[0] && `${rolls[0].label} ${rolls[0].chance}%: rolled ${rolls[0].roll}, ${rolls[0].outcome}`}</p>
      <Win title={`LIVE SHEET // ${(c.details.name || 'UNNAMED').toUpperCase()}`} right={professionOf(c)?.name}>
        <div className="row noprint">
          <Btn onPress={() => { if (!confirm('Leave the live sheet? Bookmark or copy its link first to keep your progress.')) return; history.replaceState(null, '', location.pathname); location.reload(); }}>&lt; Back to editor</Btn>
          <Btn onPress={() => navigator.clipboard.writeText(location.origin + location.pathname + link).then(() => setCopied(true), () => alert('Clipboard unavailable.')).finally(() => setTimeout(() => setCopied(false), 1500))}>{copied ? 'Link copied ✓' : 'Copy share link'}</Btn>
          <Btn onPress={() => window.print()}>Print / PDF</Btn>
        </div>
        <p className="noprint live-note"><small>Changes are saved in this page's link. Bookmark it to resume; a copied link is a snapshot, so later changes aren't synced.</small></p>
        <Counter label="HP" value={l.hp} max={d.hp} onChange={(v) => set('hp', v)} />
        <Counter label="WP" value={l.wp} max={d.wp} onChange={(v) => set('wp', v)} />
        <Counter label="SAN" value={l.san} max={d.maxSan} onChange={(v) => set('san', v)} onRoll={() => roll('SAN', l.san)} />
        <Counter label="Breaking pt" value={l.bp} onChange={(v) => set('bp', v)} />
        {l.san <= l.bp && <p className="warn">SAN at or below breaking point.</p>}
        <h3>Statistics</h3>
        <table><tbody>{STATS.map((s) => <tr key={s}><td><button className="rollable" onClick={() => roll(s, c.stats[s] * 5)}>{s} {STAT_NAMES[s]}</button></td><td className="num">{c.stats[s]}</td><td className="num">{c.stats[s] * 5}%</td></tr>)}</tbody></table>
        <h3>Bonds</h3>
        {bonds.map((b) => (
          <Counter key={b.i} label={b.name} value={l.bonds[b.i] ?? d.bondScore} max={d.bondScore} onChange={(v) => set('bonds', Object.assign([...l.bonds], { [b.i]: v }))} />
        ))}
        <h3>Notes</h3>
        <textarea aria-label="Notes" rows={6} maxLength={MAX_NOTES} className="live-notes" value={l.notes} onChange={(e) => set('notes', e.target.value)} />
      </Win>
      <Win title="SKILLS"><SkillTable c={c} onRoll={roll} /></Win>
    </div>
  );
}
