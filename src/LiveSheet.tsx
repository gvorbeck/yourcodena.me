import { useEffect, useRef, useState } from 'react';
import { STATS, STAT_NAMES, type Stat } from './rules/data/creation';
import { bondCount, derived, liveOutcome, parseLoss, professionOf, rollD100, rollExpr, type Outcome } from './rules';
import { MAX_NOTES, effStat, encodeSheet, loseSan, loseStat, permStats, refreshSpent, withBond, type Live, type SanKind } from './model/live';
import type { Character } from './model/character';
import { Btn, SkillTable, Win } from './ui';

function Counter({ label, value, max, step = 1, onChange, onRoll }: { label: string; value: number; max?: number; step?: number; onChange: (v: number) => void; onRoll?: () => void }) {
  const set = (v: number) => onChange(Math.max(0, max === undefined ? v : Math.min(max, v)));
  return (
    <div className="row counter" role="group" aria-label={label}>
      <strong>{onRoll ? <button className="rollable" onClick={onRoll}>{label}</button> : label}</strong>
      <Btn onPress={() => set(value - step)}>−</Btn>
      <output aria-live="polite">{value}{max !== undefined && ` / ${max}`}</output>
      <Btn onPress={() => set(value + step)}>+</Btn>
    </div>
  );
}

/** Three boxes toward adapting to a kind of trauma (p. 74). */
const Pips = ({ label, n }: { label: string; n: number }) => (
  <div className="pips" role="img" aria-label={`Adaptation to ${label.toLowerCase()}: ${n} of 3`}>
    <span>{label}</span>{[0, 1, 2].map((i) => <i key={i} className={i < n ? 'on' : ''} />)}
  </div>
);

interface Roll { id: number; label: string; chance: number; pen: number; roll: number; outcome: Outcome }

const RollLine = ({ r }: { r: Roll }) => (
  <>{r.label} {r.chance}%{r.pen ? ` (−${r.pen})` : ''}: <b>{String(r.roll).padStart(2, '0')}</b>{' '}
    <span className={`${r.outcome.includes('success') ? 'ok' : 'warn'}${r.outcome === 'success' || r.outcome === 'failure' ? '' : ' strong'}`}>{r.outcome.toUpperCase()}</span></>
);

const tenth = (v: number) => v || 10; // a 0 on a d10 reads as 10

export function LiveSheet({ c, init }: { c: Character; init: Live }) {
  const [l, setL] = useState(init);
  const [copied, setCopied] = useState(false);
  const [rolls, setRolls] = useState<Roll[]>([]);
  const nextId = useRef(0);
  const [once, setOnce] = useState(0); // Distraction: applies to the next test only
  const [alerts, setAlerts] = useState<string[]>([]);
  const [dismissed, setDismissed] = useState(-1);
  const [injury, setInjury] = useState<number | null>(null);
  const [injuryStat, setInjuryStat] = useState<Stat>('STR');
  const [san, setSan] = useState({ kind: 'violence' as SanKind, loss: '0/1D4' });
  const [pending, setPending] = useState<{ kind: SanKind; amount: number } | null>(null);
  const [bondPick, setBondPick] = useState(0);
  const d = derived(permStats(c, l));
  const say = (...m: string[]) => setAlerts((p) => [...m, ...p].slice(0, 8));
  const dice = (e: string) => rollExpr(e) ?? 0;
  const test = (label: string, base: number, wp = l.wp) => {
    const r = rollD100();
    const { chance, pen, outcome } = liveOutcome(r, base, wp, l.penalty + once);
    setOnce(0);
    setRolls((p) => [{ id: nextId.current++, label, chance, pen, roll: r, outcome }, ...p].slice(0, 10));
    return { outcome, roll: r, ok: outcome === 'success' || outcome === 'critical success' };
  };
  const roll = (label: string, chance: number) => { test(label, chance); };
  const link = encodeSheet(c, l);
  // The URL is the save file. Debounced and guarded: Safari throws past 100 replaceState calls per 30 s.
  useEffect(() => {
    const t = setTimeout(() => { try { history.replaceState(null, '', link); } catch { /* rate limited; next change retries */ } }, 300);
    return () => clearTimeout(t);
  }, [link]);
  const set = <K extends keyof Live>(k: K, v: Live[K]) => setL((p) => ({ ...p, [k]: v }));
  const bonds = c.bonds.slice(0, bondCount(c)).map((b, i) => ({ ...b, i })).filter((b) => b.name);
  const bond = bonds.some((b) => b.i === bondPick) ? bondPick : bonds[0]?.i;
  const spend = (k: keyof Live['spent']) => setL((p) => ({ ...p, spent: { ...p.spent, [k]: true } }));
  const prevHp = useRef(init.hp);
  useEffect(() => {
    const prev = prevHp.current; // read now: the updater below runs after this assignment
    prevHp.current = l.hp;
    setL((p) => refreshSpent(p, prev));
  }, [l.hp]);
  const fumble = rolls[0]?.outcome === 'fumble' && rolls[0].id !== dismissed ? rolls[0] : null;
  const con5 = () => effStat(c, l, 'CON') * 5;

  // ---- Fumbles (p. 44)
  const fumbled = (fn: () => void) => () => { fn(); if (fumble) setDismissed(fumble.id); };
  const strain = fumbled(() => { const n = dice('1D6'); set('hp', Math.max(0, l.hp - n)); say(`Physical strain: lost ${n} HP.`); });
  const burnout = fumbled(() => { const n = dice('1D6'); set('wp', Math.max(0, l.wp - n)); say(`Emotional burnout: lost ${n} WP.`); });
  const exhaust = fumbled(() => { const n = dice('1D6'); setL((p) => ({ ...p, wp: Math.max(0, p.wp - n), penalty: Math.min(60, p.penalty + 20) })); say(`Exhausted: lost ${n} WP, −20% to all tests until a full night's sleep (p. 47).`); });
  const distract = fumbled(() => setOnce(20));

  // ---- Damage and healing (pp. 54–55)
  const heal = () => { spend('heal'); const n = dice('1D4'); set('hp', Math.min(d.hp, l.hp + n)); say(`Healed ${n} HP. First Aid or treatment doubles on a critical, and a fumble does 1D4 damage (p. 55).`); };
  const recuperate = () => {
    spend('rest');
    const t = test('CON×5 (rest)', con5());
    const n = t.outcome === 'critical success' ? dice('1D4') : t.ok ? 1 : t.outcome === 'fumble' ? -1 : 0;
    set('hp', Math.max(0, Math.min(d.hp, l.hp + n)));
  };
  const injuryTest = () => {
    spend('injury');
    const t = test('CON×5 (injury)', con5());
    if (t.ok) return say('No permanent injury.');
    const n = Math.min(tenth(Math.floor((t.roll % 100) / 10)), tenth(t.roll % 10)); // lowest d10 of the percentile roll
    setInjury(n); say(`Permanent injury: the Handler picks a stat to lose ${n} (p. 55).`);
  };
  const applyInjury = () => {
    if (injury === null) return;
    const r = loseStat(c, l, injuryStat, injury);
    setL(r.live); setInjury(null); say(`Permanently lost ${r.lost} ${injuryStat}.`);
  };
  const sleep = () => {
    spend('sleep');
    const n = dice('1D6');
    setL((p) => ({ ...p, wp: Math.min(d.wp, p.wp + n), penalty: 0, statLoss: Object.fromEntries(Object.entries(p.statLoss).map(([k, v]) => [k, Math.max(0, v - 1)])) }));
    say(`Full night's sleep: +${n} WP (once per 24 h), exhaustion cured, 1 point of each lost stat restored. After insanity or a new disorder, make a SAN test first (p. 47).`);
  };
  const lose = (s: Stat, by: number) => set('statLoss', { ...l.statLoss, [s]: Math.max(0, Math.min(18, (l.statLoss[s] ?? 0) + by)) });

  // ---- Sanity (pp. 66–75)
  const adapted = (k: SanKind) => (k === 'violence' ? l.adapt.v : k === 'helplessness' ? l.adapt.h : 0) >= 3;
  const sanRoll = () => {
    const loss = parseLoss(san.loss);
    if (!loss) return say('SAN loss must be written success/failure, like 0/1D4 or 1/1D10.');
    const auto = adapted(san.kind) && l.wp > 0;
    if (auto) say(`Adapted to ${san.kind}: the SAN roll automatically succeeds (p. 74).`);
    const ok = auto || test('SAN', l.san).ok;
    setPending({ kind: san.kind, amount: rollExpr(ok ? loss[0] : loss[1]) ?? 0 });
  };
  const applySan = () => {
    if (!pending) return;
    const r = loseSan(c, l, pending.amount, pending.kind);
    setL(r.live); setPending(null); say(`Lost ${pending.amount} SAN.`, ...r.notes);
  };
  const project = () => {
    if (!pending || bond === undefined) return;
    const n = dice('1D4'), wp = Math.max(0, l.wp - n);
    setL((p) => ({ ...p, wp, bonds: wp >= 1 ? withBond(p.bonds, bond, (p.bonds[bond] ?? d.bondScore) - n, d.bondScore) : p.bonds }));
    if (wp < 1) return say(`Spent ${n} WP but none is left: the loss stands.`);
    setPending({ ...pending, amount: Math.max(0, pending.amount - n) });
    say(`Projected onto a Bond: spent ${n} WP, SAN loss reduced by ${n}, Bond reduced by ${n}. Describe the strain (p. 74).`);
  };
  const repress = () => {
    if (bond === undefined) return;
    const n = dice('1D4'), wp = Math.max(0, l.wp - n);
    if (wp < 1) { set('wp', wp); return say(`Spent ${n} WP but none is left: cannot repress.`); }
    setL((p) => ({ ...p, wp, bonds: withBond(p.bonds, bond, (p.bonds[bond] ?? d.bondScore) - n, d.bondScore) }));
    say(test('SAN (repress)', l.san, wp).ok ? `Spent ${n} WP and ${n} Bond points: the episode is suppressed (p. 75).` : `Spent ${n} WP and ${n} Bond points, but the episode takes hold.`);
  };

  return (
    <div className="shell live">
      <div className="rollbar noprint">
        {rolls.length === 0 ? <span className="dim">Click a stat or skill to roll d% against it (at or below passes).</span> : rolls.map((r, i) => (
          <span key={r.id} className={i === 0 ? 'latest' : 'dim'}><RollLine r={r} /></span>
        ))}
      </div>
      <p className="sr-only" aria-live="polite">{rolls[0] && `${rolls[0].label} ${rolls[0].chance}%: rolled ${rolls[0].roll}, ${rolls[0].outcome}`}</p>

      <Win className="live-status" title={`LIVE SHEET // ${(c.details.name || 'UNNAMED').toUpperCase()}`} right={professionOf(c)?.name}>
        <div className="row noprint">
          <Btn onPress={() => { if (!confirm('Leave the live sheet? Bookmark or copy its link first to keep your progress.')) return; history.replaceState(null, '', location.pathname); location.reload(); }}>&lt; Back to editor</Btn>
          <Btn onPress={() => navigator.clipboard.writeText(location.origin + location.pathname + link).then(() => setCopied(true), () => alert('Clipboard unavailable.')).finally(() => setTimeout(() => setCopied(false), 1500))}>{copied ? 'Link copied ✓' : 'Copy share link'}</Btn>
          <Btn onPress={() => window.print()}>Print / PDF</Btn>
        </div>
        <p className="noprint live-note"><small>Changes are saved in this page's link. Bookmark it to resume; a copied link is a snapshot, so later changes aren't synced.</small></p>
        <Counter label="HP" value={l.hp} max={d.hp} onChange={(v) => set('hp', v)} />
        {l.hp === 0 && <p className="warn">0 HP: dead. First Aid within CON minutes can resuscitate (p. 55).</p>}
        {l.hp > 0 && l.hp <= 2 && <p className="warn">2 HP or fewer: unconscious and helpless. Make the CON×5 injury test under Rolls, and SAN 0/1D6 for the trauma (pp. 55, 67). A single hit for half your HP or more also stuns.</p>}
        <Counter label="WP" value={l.wp} max={d.wp} onChange={(v) => set('wp', v)} />
        {l.wp === 0 && <p className="warn">0 WP: the Handler controls the Agent and no test can succeed (p. 47).</p>}
        {l.wp > 0 && l.wp <= 2 && <p className="warn">1–2 WP: emotional breakdown, −20% to everything (p. 47).</p>}
        <Counter label="Penalty %" value={l.penalty} max={60} step={10} onChange={(v) => set('penalty', v)} />
        {once > 0 && <p className="warn">Distracted: your next test is at −{once}%.</p>}
        <Counter label="SAN" value={l.san} max={d.maxSan} onChange={(v) => set('san', v)} onRoll={() => roll('SAN', l.san)} />
        <Counter label="Breaking pt" value={l.bp} onChange={(v) => set('bp', v)} />
        {l.san <= l.bp && <p className="warn">SAN at or below breaking point.</p>}
        <Pips label="Violence" n={l.adapt.v} />
        <Pips label="Helplessness" n={l.adapt.h} />
        <h3>Statistics</h3>
        <table>
          <thead><tr><th>Stat</th><th className="num">Score</th><th className="num">Test</th><th className="noprint">Lost</th></tr></thead>
          <tbody>
            {STATS.map((s) => {
              const e = effStat(c, l, s);
              return (
                <tr key={s}>
                  <td><button className="rollable" onClick={() => roll(s, e * 5)}>{s} {STAT_NAMES[s]}</button></td>
                  <td className="num">{e}</td><td className="num">{e * 5}%</td>
                  <td className="noprint"><div className="lost"><Btn onPress={() => lose(s, -1)}>−</Btn><output>{l.statLoss[s] ?? 0}</output><Btn onPress={() => lose(s, 1)}>+</Btn></div></td>
                </tr>
              );
            })}
            <tr><td><button className="rollable" onClick={() => roll('Luck', 50)}>Luck</button></td><td /><td className="num">50%</td><td className="noprint" /></tr>
          </tbody>
        </table>
        <h3>Bonds</h3>
        {bonds.map((b) => (
          <Counter key={b.i} label={b.name} value={l.bonds[b.i] ?? d.bondScore} max={d.bondScore} onChange={(v) => set('bonds', withBond(l.bonds, b.i, v, d.bondScore))} />
        ))}
      </Win>

      <Win className="live-rolls noprint" title="ROLLS & EVENTS">
        <ol className="rolllog">
          {rolls.length === 0 ? <li className="dim">Tap a test or a skill to roll d%.</li> : rolls.map((r, i) => <li key={r.id} className={i === 0 ? 'latest' : 'dim'}><RollLine r={r} /></li>)}
        </ol>
        {fumble && (
          <div className="alerts">
            <p>Fumble on {fumble.label} (p. 44). The Handler picks a cost:</p>
            <div className="row even">
              <Btn onPress={strain}>Strain: −1D6 HP</Btn>
              <Btn onPress={burnout}>Burnout: −1D6 WP</Btn>
              <Btn onPress={exhaust}>Exhaustion</Btn>
              <Btn onPress={distract}>Distraction: next test −20%</Btn>
              <Btn onPress={() => setDismissed(fumble.id)}>Dismiss</Btn>
            </div>
            <p><small>Strain and burnout may instead cost 1D4 of STR, CON or DEX / INT, POW or CHA temporarily (use the stat table). Alienation: an NPC's CHA and Persuade tests auto-fail. Confusion: false information.</small></p>
          </div>
        )}
        {pending && (
          <div className="alerts">
            <p>{pending.amount} SAN to lose ({pending.kind}).</p>
            <div className="row even">
              <Btn onPress={applySan}>Apply</Btn>
              <Btn onPress={project} disabled={bond === undefined}>Project onto Bond (1D4 WP)</Btn>
              <Btn onPress={() => setPending(null)}>Cancel</Btn>
            </div>
          </div>
        )}
        {alerts.length > 0 && (
          <div className="alerts">
            {alerts.map((a, i) => <p key={i}>{a}</p>)}
            <Btn onPress={() => setAlerts([])}>Clear</Btn>
          </div>
        )}
        <h3>Sanity</h3>
        <div className="row">
          <select aria-label="Trauma type" value={san.kind} onChange={(e) => setSan({ ...san, kind: e.target.value as SanKind })}>
            <option value="violence">Violence</option><option value="helplessness">Helplessness</option><option value="unnatural">The Unnatural</option>
          </select>
          <input aria-label="SAN loss, success/failure" value={san.loss} onChange={(e) => setSan({ ...san, loss: e.target.value })} style={{ width: '10ch' }} />
          <Btn onPress={sanRoll}>Roll SAN</Btn>
        </div>
        <p><small>Written success/failure as in the book (pp. 67–68). For several victims add them to the failure die, like 1D6+2.</small></p>
        <div className="row">
          <select aria-label="Bond to strain" value={bond ?? ''} onChange={(e) => setBondPick(Number(e.target.value))} disabled={bond === undefined}>
            {bonds.map((b) => <option key={b.i} value={b.i}>{b.name}</option>)}
          </select>
          <Btn onPress={repress} disabled={bond === undefined}>Repress insanity (1D4 WP)</Btn>
        </div>
        <h3>Recovery</h3>
        {l.hp > 0 && l.hp <= 2 && <div className="row"><Btn onPress={injuryTest} disabled={l.spent.injury}>CON×5 injury test</Btn></div>}
        {injury !== null && (
          <div className="row">
            <span>Lose {injury} from</span>
            <select aria-label="Stat to lose" value={injuryStat} onChange={(e) => setInjuryStat(e.target.value as Stat)}>{STATS.map((s) => <option key={s}>{s}</option>)}</select>
            <Btn onPress={applyInjury}>Apply</Btn>
            <Btn onPress={() => setInjury(null)}>Skip</Btn>
          </div>
        )}
        <div className="row even">
          <Btn onPress={heal} disabled={l.spent.heal && l.hp > 0}>Heal 1D4</Btn>
          <Btn onPress={recuperate} disabled={l.spent.rest}>Rest a day (CON×5)</Btn>
          <Btn onPress={sleep} disabled={l.spent.sleep}>Full night's sleep</Btn>
        </div>
        {(l.spent.rest || l.spent.sleep) && <div className="row"><Btn onPress={() => setL((p) => ({ ...p, spent: { ...p.spent, rest: false, sleep: false } }))}>New day</Btn></div>}
        <p><small>Heal is first aid: once per injury, available again after you take more damage. Rest and sleep are once per day.</small></p>
      </Win>

      <Win className="live-skills" title="SKILLS"><SkillTable c={c} onRoll={roll} /></Win>
      <Win className="live-notes-win" title="NOTES">
        <textarea aria-label="Notes" rows={6} maxLength={MAX_NOTES} className="live-notes" value={l.notes} onChange={(e) => set('notes', e.target.value)} />
      </Win>
    </div>
  );
}
