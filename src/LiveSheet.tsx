import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { STATS, STAT_NAMES, type Stat } from './rules/data/creation';
import { bondCount, derived, isSuccess, liveOutcome, outcomeClass, professionOf, rollD100, type Outcome } from './rules';
import { d100Text, testText } from './rules/outcome';
import { MAX_NOTES, UndoStack, advanceSkills, canHeal, canInjuryTest, effStat, encodeSheet, loseSan, maxSanOf, permStats, refreshSpent, setUnnatural, unnaturalOf, withBond, type Live, type SanKind } from './model/live';
import type { Character } from './model/character';
import { Btn, ConfirmDialog, SkillTable, Win } from './ui';
import { useFocusMain } from './ui/Win';
import { useTitle } from './pages/Page';
import { copyLabel, copyNote, useCopy } from './lib/useCopy';
import * as play from './model/actions';

function Counter({ label, note, value, max, step = 1, onChange, onRoll }: { label: string; note?: string; value: number; max?: number; step?: number; onChange: (v: number) => void; onRoll?: () => void }) {
  const set = (v: number) => onChange(Math.max(0, max === undefined ? v : Math.min(max, v)));
  return (
    <div className={note ? 'row counter noted' : 'row counter'} role="group" aria-label={label}>
      <strong>{onRoll ? <button className="rollable" onClick={onRoll}>{label}</button> : label}</strong>
      <Btn label={`Decrease ${label}`} onPress={() => set(value - step)}>−</Btn>
      <output>{value}{max !== undefined && ` / ${max}`}</output>
      <Btn label={`Increase ${label}`} onPress={() => set(value + step)}>+</Btn>
      {note && <span className="dim note">{note}</span>}
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
  <>{testText(r.label, r.chance, r.pen)}: <b>{d100Text(r.roll)}</b>{' '}
    <span className={outcomeClass(r.outcome)}>{r.outcome.toUpperCase()}</span></>
);

/** A merge to apply to the live sheet's own state; a new object each time someone else saves (pages/Agent.tsx). */
export interface RemoteLive { merge: (l: Live) => Live }

/** Present when the sheet belongs to an agent in a game: saves go to Firestore and rolls to the game's log instead of the URL. */
export interface GameLink {
  gameId: string;
  /** Why the last save failed, or '' when saved. */
  failed: string;
  back: () => void;
  onChange: (l: Live) => void;
  /** Someone else's saved change to merge in (see pages/Agent.tsx). */
  remote?: RemoteLive | null;
  onRoll: (r: Omit<Roll, 'id'>) => void;
}

export function LiveSheet({ c, init, game }: { c: Character; init: Live; game?: GameLink }) {
  const start = refreshSpent(init);
  const [l, setLive] = useState(start);
  const latest = useRef(start); // newest state, so several changes in one event compose
  const [stack] = useState(() => new UndoStack());
  const [undoLabel, setUndoLabel] = useState<string | null>(null); // what Undo would revert; null = nothing
  /** Every change goes through here; the stack decides whether it earns an undo step. */
  const setL = (u: Live | ((p: Live) => Live)) => {
    const next = refreshSpent(typeof u === 'function' ? u(latest.current) : u); // once HP is back above 2, the next drop is a new injury event
    if (stack.record(latest.current, next, c.bonds.map((b) => b.name))) setUndoLabel(stack.label);
    latest.current = next;
    setLive(next);
  };
  const undo = () => {
    const prev = stack.undo(latest.current);
    if (!prev) return;
    latest.current = prev;
    setUndoLabel(stack.label);
    setLive(prev);
    setPending(null); // a half-resolved SAN loss was priced against the state just reverted
  };
  // Someone else saved (Discord damage, another device): merge it in without an undo step, and drop older undo steps
  // so undo can't revert their change.
  const remote = game?.remote;
  useEffect(() => {
    if (!remote) return;
    const next = refreshSpent(remote.merge(latest.current));
    stack.clear();
    setUndoLabel(null);
    latest.current = next;
    setLive(next);
  }, [remote, stack]);
  const sent = useRef(init); // last state handed to game.onChange
  // Runs on state changes only: `game` is a fresh object every render and must not re-send the same state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (l !== sent.current) { sent.current = l; game?.onChange(l); } }, [l]);
  useTitle(`Live: ${c.details.name.trim() || 'Unnamed agent'}`);
  useFocusMain();
  const [copied, copy] = useCopy();
  const [leaving, setLeaving] = useState(false);
  const [rolls, setRolls] = useState<Roll[]>([]);
  const nextId = useRef(0);
  const [once, setOnce] = useState(0); // Distraction: applies to the next test only
  const [alerts, setAlerts] = useState<string[]>([]);
  const [dismissed, setDismissed] = useState(-1);
  const [injury, setInjury] = useState<number | null>(null);
  const [injuryStat, setInjuryStat] = useState<Stat>('STR');
  const [san, setSan] = useState({ kind: 'violence' as SanKind, loss: '0/1D4' });
  const [pending, setPending] = useState<{ kind: SanKind; amount: number; result: string } | null>(null);
  const [bondPick, setBondPick] = useState(0);
  const d = derived(permStats(c, l));
  const say = (...m: string[]) => setAlerts((p) => [...m, ...p].slice(0, 8));
  /** Run a pure action on the newest state, then show its notes. */
  const act = (fn: (cur: Live) => play.Result) => { const r = fn(latest.current); setL(r.live); say(...r.notes); };
  const test = (label: string, base: number, wp = l.wp) => {
    const r = rollD100();
    const { chance, pen, outcome } = liveOutcome(r, base, wp, l.penalty + (l.exhausted ? 20 : 0) + once);
    setOnce(0);
    setRolls((p) => [{ id: nextId.current++, label, chance, pen, roll: r, outcome }, ...p].slice(0, 10));
    game?.onRoll({ label, chance, pen, roll: r, outcome });
    return { outcome, roll: r, chance, ok: isSuccess(outcome) };
  };
  const roll = (label: string, chance: number) => { test(label, chance); };
  /** A failed skill roll earns a check toward end-of-session advancement (p. 28). */
  const rollSkill = (key: string, chance: number) => {
    if (!test(key, chance).ok) setL((p) => play.checkSkill(p, key));
  };
  const endSession = () => {
    const r = advanceSkills(c, l);
    setL(r.live);
    say(r.gains.length ? `Skills advanced (p. 28): ${r.gains.map(([k, n]) => `${k} +${n}`).join(', ')}.` : 'No checked skills could advance.');
  };
  const maxSan = maxSanOf(c, l);
  const [disorder, setDisorder] = useState('');
  const [drop, setDrop] = useState('');
  const motivations = c.motivations.map((m) => m.trim()).filter((m) => m && !l.dropped.includes(m));
  const addDisorder = () => {
    const name = disorder.trim();
    if (!name) return;
    act((cur) => play.addDisorder(cur, name, motivations.includes(drop) ? drop : ''));
    setDisorder(''); setDrop('');
  };
  const link = game ? '' : encodeSheet(c, l);
  // The URL is the save file. Debounced and guarded: Safari throws past 100 replaceState calls per 30 s.
  useEffect(() => {
    if (game) return; // saved to Firestore instead
    const t = setTimeout(() => { try { history.replaceState(null, '', link); } catch { /* rate limited; next change retries */ } }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `game` only decides whether to skip; `link` is what changes
  }, [link]);
  const set = <K extends keyof Live>(k: K, v: Live[K]) => setL((p) => ({ ...p, [k]: v }));
  const bonds = c.bonds.slice(0, bondCount(c)).map((b, i) => ({ ...b, i })).filter((b) => b.name);
  const bond = bonds.some((b) => b.i === bondPick) ? bondPick : bonds[0]?.i;
  const [find, setFind] = useState('');
  /** Phone shortcut between Status and Skills; honours reduced-motion. */
  const jump = (sel: string, focus: string) => {
    document.querySelector(sel)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    document.querySelector<HTMLElement>(focus)?.focus({ preventScroll: true }); // keyboard and screen-reader users land there too
  };
  const fumble = rolls[0]?.outcome === 'fumble' && rolls[0].id !== dismissed ? rolls[0] : null;
  const con5 = () => effStat(c, l, 'CON') * 5;

  // ---- Fumbles (p. 44), damage and healing (pp. 54–55), sanity (pp. 66–75): the rules live in model/actions.ts
  const fumbled = (fn: () => void) => () => { fn(); if (fumble) setDismissed(fumble.id); };
  const strain = fumbled(() => act((cur) => play.strain(cur)));
  const burnout = fumbled(() => act((cur) => play.burnout(cur)));
  const exhaust = fumbled(() => act((cur) => play.exhaust(cur)));
  const distract = fumbled(() => setOnce(20));

  const heal = () => act((cur) => play.heal(c, cur));
  const recuperate = () => {
    const t = test('CON×5 (rest)', con5());
    setL((cur) => play.recuperate(c, cur, t.outcome));
  };
  const injuryTest = () => {
    setL(play.spendInjuryTest);
    const t = test('CON×5 (injury)', con5());
    if (t.ok) return say('No permanent injury.');
    const n = play.lowestD10(t.roll);
    setInjury(n); say(`Permanent injury: the Handler picks a stat to lose ${n} (p. 55).`);
  };
  const applyInjury = () => {
    if (injury === null) return;
    act((cur) => play.applyInjury(c, cur, injuryStat, injury));
    setInjury(null);
  };
  const sleep = () => act((cur) => play.sleep(c, cur));
  const lose = (s: Stat, by: number) => setL((cur) => play.adjustStatLoss(cur, s, by));

  const sanRoll = () => {
    const r = play.planSanLoss(l, san.kind, san.loss, () => test('SAN (loss)', l.san));
    if ('error' in r) return say(r.error);
    setPending(r);
  };
  const applySan = () => {
    if (!pending) return;
    const r = loseSan(c, l, pending.amount, pending.kind);
    setL(r.live); setPending(null); say(`Lost ${pending.amount} SAN.`, ...r.notes);
  };
  const project = () => {
    if (!pending || bond === undefined) return;
    const r = play.project(c, latest.current, pending, bond);
    setL(r.live); setPending(r.pending); say(...r.notes);
  };
  const repress = () => {
    if (bond !== undefined) act((cur) => play.repress(c, cur, bond, (wp) => test('SAN (repress)', cur.san, wp).ok));
  };

  return (
    <main id="main" tabIndex={-1}>
    <h1 className="sr-only">Live sheet: {c.details.name.trim() || 'unnamed agent'}</h1>
    <div className="shell live">
      <div className="rollbar noprint">
        {rolls.length === 0 ? <span className="dim">Tap a stat, Luck or skill name to roll d% against it (at or below passes).</span> : rolls.map((r, i) => (
          <span key={r.id} className={i === 0 ? 'latest' : 'dim'}><RollLine r={r} /></span>
        ))}
      </div>
      <p className="sr-only" aria-live="polite">{rolls[0] && `${rolls[0].label} ${rolls[0].chance}%: rolled ${rolls[0].roll}, ${rolls[0].outcome}`}</p>

      <Win className="live-status" title={`LIVE SHEET // ${(c.details.name || 'UNNAMED').toUpperCase()}`} right={professionOf(c)?.name}>
        <div className="row noprint">
          {game ? <>
            <Link className="btn" to={`/g/${game.gameId}`}>&lt; Game</Link>
            <Btn onPress={game.back}>Edit agent</Btn>
          </> : <Btn onPress={() => setLeaving(true)}>&lt; Home</Btn>}
          <Btn onPress={() => copy(game ? location.href : location.origin + location.pathname + link)}>{copyLabel(copied, game ? 'Copy agent link' : 'Copy share link')}</Btn>
          <span className="sr-only" role="status">{copyNote(copied)}</span>
          <ConfirmDialog open={leaving} title="Leave this sheet?" confirm="Leave" onClose={() => setLeaving(false)}
            onConfirm={() => { history.replaceState(null, '', location.pathname); location.reload(); }}>
            Bookmark or copy its link first to keep your progress.
          </ConfirmDialog>
          <Btn onPress={() => window.print()}>Print / PDF</Btn>
          <Btn onPress={undo} disabled={undoLabel === null}>{undoLabel ? `Undo: ${undoLabel}` : 'Undo'}</Btn>
          <Btn className="phone-only" onPress={() => jump('.live-skills', '.skill-find')}>Skills ↓</Btn>
        </div>
        <p className="noprint live-note"><small>{!game ? "Saved in this page's link: bookmark it to resume. A copied link is a snapshot."
          : game.failed ? <span className="warn" role="alert">{game.failed}</span> : `Saved to game ${game.gameId}. Your rolls appear in its log.`}</small></p>
        {fumble && (
          <div className="alerts noprint">
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
        <div role="status" className="noprint">
          {alerts.length > 0 && (
            <div className="alerts">
              {alerts.map((a, i) => <p key={i}>{a}</p>)}
              <Btn onPress={() => setAlerts([])}>Clear</Btn>
            </div>
          )}
        </div>

        <h3>Vitals</h3>
        <Counter label="HP" value={l.hp} max={d.hp} onChange={(v) => set('hp', v)} />
        {l.hp === 0 && <p className="warn">0 HP: dead. First Aid within CON minutes can resuscitate (p. 55).</p>}
        {l.hp > 0 && l.hp <= 2 && <p className="warn">2 HP or fewer: unconscious. Make the CON×5 injury test, and SAN 0/1D6 (pp. 55, 67). A hit for half your HP also stuns.</p>}
        <Counter label="WP" value={l.wp} max={d.wp} onChange={(v) => set('wp', v)} />
        {l.wp === 0 && <p className="warn">0 WP: the Handler controls the Agent and no test can succeed (p. 47).</p>}
        {l.wp > 0 && l.wp <= 2 && <p className="warn">1–2 WP: emotional breakdown, −20% to everything (p. 47).</p>}
        <Counter label="Penalty %" value={l.penalty} step={10} max={60} onChange={(v) => set('penalty', v)} />
        {l.exhausted && <p className="warn">Exhausted: −20% to every test until a full night's sleep (p. 47).</p>}
        {once > 0 && <p className="warn">Distracted: your next test is at −{once}%.</p>}
        <div className="row even noprint">
          {l.hp > 0 && l.hp <= 2 && <Btn onPress={injuryTest} disabled={!canInjuryTest(l)}>CON×5 injury test</Btn>}
          <Btn onPress={heal} disabled={!canHeal(l)}>Heal 1D4</Btn>
          <Btn onPress={recuperate} disabled={l.spent.rest}>Rest a day (CON×5)</Btn>
          <Btn onPress={sleep} disabled={l.spent.sleep}>Full night's sleep</Btn>
          {(l.spent.rest || l.spent.sleep) && <Btn onPress={() => setL((p) => ({ ...p, spent: { ...p.spent, rest: false, sleep: false } }))}>New day</Btn>}
        </div>
        {(!canHeal(l) || l.spent.rest || l.spent.sleep) && (
          <p className="noprint dim"><small>{[!canHeal(l) && 'Heal is first aid: again after you take more damage.', (l.spent.rest || l.spent.sleep) && 'Rest and sleep are once a day: press New day.'].filter(Boolean).join(' ')}</small></p>
        )}
        {injury !== null && (
          <div className="row noprint">
            <span>Permanent injury: lose {injury} from</span>
            <select aria-label="Stat to lose" value={injuryStat} onChange={(e) => setInjuryStat(e.target.value as Stat)}>{STATS.map((s) => <option key={s}>{s}</option>)}</select>
            <Btn onPress={applyInjury}>Apply</Btn>
            <Btn onPress={() => setInjury(null)}>Skip</Btn>
          </div>
        )}

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
                  <td className="noprint"><div className="lost"><Btn label={`Restore 1 lost ${s}`} onPress={() => lose(s, -1)}>−</Btn><output aria-label={`${s} lost`}>{l.statLoss[s] ?? 0}</output><Btn label={`Lose 1 ${s}`} onPress={() => lose(s, 1)}>+</Btn></div></td>
                </tr>
              );
            })}
            <tr><td><button className="rollable" onClick={() => roll('Luck', 50)}>Luck</button></td><td /><td className="num">50%</td><td className="noprint" /></tr>
          </tbody>
        </table>
        <p className="noprint dim"><small>Tap a stat or Luck to roll d%. “Lost” is temporary stat loss.</small></p>

        <h3>Sanity</h3>
        <Counter label="SAN" value={l.san} max={maxSan} onChange={(v) => set('san', v)} onRoll={() => roll('SAN test', l.san)} />
        <Counter label="Breaking pt" value={l.bp} onChange={(v) => set('bp', v)} />
        <Counter label="Unnatural" note="Raises with exposure; maximum SAN is 99 minus it (p. 15)." value={unnaturalOf(c, l)} max={99} onChange={(v) => setL((p) => setUnnatural(c, p, v))} />
        {l.san <= l.bp && <p className="warn">SAN at or below breaking point.</p>}
        <div className="row noprint">
          <select aria-label="Trauma type" value={san.kind} onChange={(e) => setSan({ ...san, kind: e.target.value as SanKind })}>
            <option value="violence">Violence</option><option value="helplessness">Helplessness</option><option value="unnatural">The Unnatural</option>
          </select>
          <input className="san-loss" aria-label="SAN loss as success/failure, like 0/1D4" title="Success/failure loss as printed in the book (pp. 67–68). Add extra victims to the failure die, like 1D6+2 (the total never exceeds the die's maximum)." value={san.loss} onChange={(e) => setSan({ ...san, loss: e.target.value })} />
          <Btn onPress={sanRoll}>Roll SAN loss</Btn>
        </div>
        <p className="noprint dim"><small>Loss is success/failure, like 0/1D4. Extra victims go on the failure die: 1D6+2, capped at 6. Tap “SAN” above for a plain SAN test.</small></p>
        <div role="status" className="noprint">
        {pending && (
          <div className="alerts">
            <p>{pending.result} {pending.amount} SAN to lose ({pending.kind}).</p>
            <div className="row even">
              <Btn onPress={applySan}>Apply</Btn>
              <Btn onPress={project} disabled={bond === undefined}>Project onto Bond (1D4 WP)</Btn>
              <Btn onPress={() => setPending(null)}>Cancel</Btn>
            </div>
          </div>
        )}
        </div>
        <div className="row noprint">
          <label className="lbl" htmlFor="strain-bond">Bond to strain</label>
          <select id="strain-bond" value={bond ?? ''} onChange={(e) => setBondPick(Number(e.target.value))} disabled={bond === undefined}>
            {bonds.map((b) => <option key={b.i} value={b.i}>{b.name}</option>)}
          </select>
          <Btn onPress={repress} disabled={bond === undefined}>Repress insanity (1D4 WP)</Btn>
        </div>
        <Pips label="Violence" n={l.adapt.v} />
        <Pips label="Helplessness" n={l.adapt.h} />

        <h3>Mind</h3>
        <p className="noprint dim"><small>Each time the Breaking Point is reached, a disorder replaces one motivation (pp. 38, 69).</small></p>
        <p>Motivations: {motivations.length ? motivations.join(' · ') : <span className="dim">none left</span>}</p>
        <p>Disorders: {l.disorders.length ? l.disorders.join(' · ') : <span className="dim">none</span>}</p>
        <div className="row noprint">
          <input aria-label="New disorder" placeholder="new disorder" value={disorder} maxLength={100} onChange={(e) => setDisorder(e.target.value)} />
          <select aria-label="Motivation it replaces" value={drop} onChange={(e) => setDrop(e.target.value)}>
            <option value="">— no motivation lost —</option>
            {motivations.map((m) => <option key={m}>{m}</option>)}
          </select>
          <Btn onPress={addDisorder} disabled={!disorder.trim()}>Add disorder</Btn>
        </div>

        <h3>Bonds</h3>
        {bonds.map((b) => (
          <Counter key={b.i} label={b.name} note={b.note} value={l.bonds[b.i] ?? d.bondScore} max={d.bondScore} onChange={(v) => set('bonds', withBond(l.bonds, b.i, v, d.bondScore))} />
        ))}
      </Win>

      <Win className="live-skills" title="SKILLS">
        <Btn className="phone-only noprint" onPress={() => jump('.live-status', '.live-status .btn')}>↑ Status</Btn>
        <input className="noprint skill-find" type="search" aria-label="Search skills" placeholder="search skills · tap to roll" value={find} onChange={(e) => setFind(e.target.value)} />
        <div className="row noprint">
          <Btn onPress={endSession} disabled={l.checked.length === 0}>End session: advance {l.checked.length} checked</Btn>
        </div>
        <SkillTable c={c} onRoll={rollSkill} filter={find} advance={l.advance} checked={l.checked} onUncheck={(k) => setL((p) => play.uncheckSkill(p, k))} />
      </Win>
      <Win className="live-notes-win" title="NOTES">
        <textarea aria-label="Notes" rows={6} maxLength={MAX_NOTES} className="live-notes" value={l.notes} onChange={(e) => set('notes', e.target.value)} />
      </Win>
    </div>
    </main>
  );
}
