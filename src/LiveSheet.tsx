import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { STATS, STAT_NAMES, type Stat } from './rules/data/creation';
import { activeBonds, featureOf, isSuccess, liveOutcome, motivationsOf, professionOf, rollD100, testOutcome, type Outcome } from './rules';
import { pad2, testText } from './rules/outcome';
import { MAX_NOTES, UndoStack, advanceSkills, bondScoreOf, canHeal, canInjuryTest, capsOf, effStat, encodeSheet, refreshSpent, sheetPenalty, coreTests, withBond, type Live } from './model/live';
import { DETAIL_FIELDS, nameOf, type Character } from './model/character';
import { Btn, ConfirmDialog, Counter, SkillTable, Win } from './ui';
import { SanSection } from './SanSection';
import { DiceRoller } from './DiceRoller';
import { useFocusMain } from './ui/Win';
import { useTitle } from './pages/Page';
import { Alert, CopyButton, Hint, OutcomeText } from './ui/bits';
import { gameUrl } from './lib/paths';
import type { HeldSan } from './lib/games';
import * as play from './model/actions';

/** A d% test as the roll log stores it (rules/outcome.ts TestEntry), plus a local id. `chance` is after the penalty. */
interface Roll { id: number; label: string; chance: number; penalty: number; roll: number; outcome: Outcome }

const RollLine = ({ r }: { r: Roll }) => (
  <>{testText(r.label, r.chance, r.penalty)}: <b>{pad2(r.roll)}</b> <OutcomeText o={r.outcome} /></>
);

/** A merge to apply to the live sheet's own state; a new object each time someone else saves (pages/Agent.tsx). */
export interface RemoteLive { merge: (l: Live) => Live }

/** Present when the sheet belongs to an agent in a game: saves go to Firestore and rolls to the game's log instead of the URL. */
export interface GameLink {
  gameId: string;
  /** Why the last save failed, or '' when saved. */
  failed: string;
  /** A SAN loss the Discord bot is holding for this Agent's player. */
  held?: HeldSan;
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
  /** Show `next` as the newest state, with the undo stack as it now stands. */
  const show = (next: Live) => { latest.current = next; setUndoLabel(stack.label); setLive(next); };
  /** Every change goes through here; the stack decides whether it earns an undo step. */
  const setL = (u: Live | ((p: Live) => Live)) => {
    const next = refreshSpent(typeof u === 'function' ? u(latest.current) : u); // once HP is back above 2, the next drop is a new injury event
    stack.record(latest.current, next, c.bonds.map((b) => b.name));
    show(next);
  };
  const undo = () => {
    const prev = stack.undo(latest.current);
    if (!prev) return;
    show(prev);
    setUndone((n) => n + 1);
  };
  // Someone else saved (Discord damage, another device): merge it in without an undo step, and drop older undo steps
  // so undo can't revert their change.
  const remote = game?.remote;
  useEffect(() => {
    if (!remote) return;
    stack.clear();
    show(refreshSpent(remote.merge(latest.current)));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `show` only touches refs, the stack and state setters
  }, [remote, stack]);
  const sent = useRef(init); // last state handed to game.onChange
  // Runs on state changes only: `game` is a fresh object every render and must not re-send the same state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (l !== sent.current) { sent.current = l; game?.onChange(l); } }, [l]);
  const name = nameOf(c);
  useTitle(`Live: ${name}`);
  useFocusMain();
  const [leaving, setLeaving] = useState(false);
  const [rolls, setRolls] = useState<Roll[]>([]);
  const nextId = useRef(0);
  const [once, setOnce] = useState(0); // Distraction: applies to the next test only
  const [alerts, setAlerts] = useState<string[]>([]);
  const [dismissed, setDismissed] = useState(-1);
  const [injury, setInjury] = useState<number | null>(null);
  const [injuryStat, setInjuryStat] = useState<Stat>('STR');
  const [undone, setUndone] = useState(0); // tells the SAN section to drop a half-resolved loss priced against the state just reverted
  const d = capsOf(c, l);
  const say = (...m: string[]) => setAlerts((p) => [...m, ...p].slice(0, 8));
  /** Run a pure action on the newest state, then show its notes. */
  const act = (fn: (cur: Live) => play.Result) => { const r = fn(latest.current); setL(r.live); say(...r.notes); };
  /** `flat`: pure chance (Luck, p. 44), with no sheet penalties, low WP or distraction. */
  const test = (label: string, base: number, wp = l.wp, flat?: boolean) => {
    const r = rollD100();
    const { chance, pen: penalty, outcome } = flat ? { chance: base, pen: 0, outcome: testOutcome(r, base) } : liveOutcome(r, base, wp, sheetPenalty(l) + once);
    if (!flat) setOnce(0);
    const entry = { label, chance, penalty, roll: r, outcome };
    setRolls((p) => [{ ...entry, id: nextId.current++ }, ...p].slice(0, 10));
    game?.onRoll(entry);
    return { outcome, roll: r, chance, ok: isSuccess(outcome) };
  };
  /** A failed skill roll earns a check toward end-of-session advancement (p. 28). */
  const rollSkill = (key: string, chance: number) => {
    if (!test(key, chance).ok) setL((p) => play.checkSkill(p, key, chance));
  };
  const endSession = () => {
    const r = advanceSkills(c, latest.current); // the newest state, like act(), so a change merged in this render isn't dropped
    setL(r.live);
    say(r.gains.length ? `Skills advanced (p. 28): ${r.gains.map(([k, n]) => `${k} +${n}`).join(', ')}.` : 'No checked skills could advance.');
  };
  const [disorder, setDisorder] = useState('');
  const [drop, setDrop] = useState('');
  const motivations = motivationsOf(c).filter((m) => !l.dropped.includes(m));
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
  const bonds = activeBonds(c);
  // Stats, Luck and SAN roll under the same labels and chances as /dg roll (model/live.ts coreTests).
  const tests = new Map(coreTests({ c, l }).map((t) => [t.id, t]));
  const rollId = (id: string) => { const t = tests.get(id)!; test(t.label, t.chance, l.wp, t.flat); };
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


  return (
    <main id="main" tabIndex={-1}>
    <h1 className="sr-only">Live sheet: {name}</h1>
    <div className="shell live">
      <div className="rollbar noprint">
        {rolls.length === 0 ? <span className="dim">Tap a stat, Luck or skill name to roll d% against it (at or below passes).</span> : rolls.map((r, i) => (
          <span key={r.id} className={i === 0 ? 'latest' : 'dim'}><RollLine r={r} /></span>
        ))}
      </div>
      <p className="sr-only" aria-live="polite">{rolls[0] && `${rolls[0].label} ${rolls[0].chance}%: rolled ${rolls[0].roll}, ${rolls[0].outcome}`}</p>

      <Win className="live-status" title={`LIVE SHEET // ${name.toUpperCase()}`} right={professionOf(c)?.name}>
        <div className="row noprint">
          {game ? <>
            <Link className="btn" to={gameUrl(game.gameId)}>&lt; Game</Link>
            <Btn onPress={game.back}>Edit agent</Btn>
          </> : <Btn onPress={() => setLeaving(true)}>&lt; Home</Btn>}
          <CopyButton text={() => (game ? location.href : location.origin + location.pathname + link)} label={game ? 'Copy agent link' : 'Copy share link'} />
          <ConfirmDialog open={leaving} title="Leave this sheet?" confirm="Leave" onClose={() => setLeaving(false)}
            onConfirm={() => { history.replaceState(null, '', location.pathname); location.reload(); }}>
            Bookmark or copy its link first to keep your progress.
          </ConfirmDialog>
          <Btn onPress={() => window.print()}>Print / PDF</Btn>
          <Btn onPress={undo} disabled={undoLabel === null}>{undoLabel ? `Undo: ${undoLabel}` : 'Undo'}</Btn>
          <Btn className="phone-only" onPress={() => jump('.live-skills', '.skill-find')}>Skills ↓</Btn>
        </div>
        <p className="noprint live-note"><small>{!game ? "Saved in this page's link: bookmark it to resume. A copied link is a snapshot."
          : game.failed ? <Alert inline>{game.failed}</Alert> : `Saved to game ${game.gameId}. Your rolls appear in its log.`}</small></p>
        <DiceRoller />
        <div role="status" className="noprint">
          {game?.held && <p className="warn">A {game.held.amount} SAN loss ({game.held.kind}) is waiting on a choice in Discord: project it onto a Bond or take it. SAN drops once it is settled.</p>}
        </div>
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
        <div className={alerts.length ? 'alerts noprint' : 'noprint'}>
          <div role="status">{alerts.map((a, i) => <p key={i}>{a}</p>)}</div>
          {alerts.length > 0 && <Btn onPress={() => setAlerts([])}>Clear</Btn>}
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
          <Hint className="noprint">{[!canHeal(l) && 'Heal is first aid: again after you take more damage.', (l.spent.rest || l.spent.sleep) && 'Rest and sleep are once a day: press New day.'].filter(Boolean).join(' ')}</Hint>
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
                  <td><button className="rollable" onClick={() => rollId(`stat:${s}`)}>{s} {STAT_NAMES[s]}</button></td>
                  <td className="num">{e}</td><td className="num">{e * 5}%</td>
                  <td className="noprint"><div className="lost"><Btn label={`Restore 1 lost ${s}`} onPress={() => lose(s, -1)}>−</Btn><output aria-label={`${s} lost`}>{l.statLoss[s] ?? 0}</output><Btn label={`Lose 1 ${s}`} onPress={() => lose(s, 1)}>+</Btn></div></td>
                </tr>
              );
            })}
            <tr><td><button className="rollable" onClick={() => rollId('luck')}>Luck</button></td><td /><td className="num">{tests.get('luck')!.chance}%</td><td className="noprint" /></tr>
          </tbody>
        </table>
        <Hint className="noprint">Tap a stat or Luck to roll d%. “Lost” is temporary stat loss.</Hint>

        <SanSection undone={undone} c={c} l={l} set={set} setL={setL} act={act} say={say} test={test} onRollSan={() => rollId('san')} />

        <h3>Mind</h3>
        <Hint className="noprint">Each time the Breaking Point is reached, a disorder replaces one motivation (pp. 38, 69).</Hint>
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
        <div className="live-bonds">
          {bonds.map((b) => (
            <Counter key={b.i} label={b.name} note={b.note} value={bondScoreOf(c, l, b.i)} max={d.bondScore} onChange={(v) => set('bonds', withBond(l.bonds, b.i, v, d.bondScore))} />
          ))}
        </div>
      </Win>

      <Win className="live-skills" title="SKILLS">
        <Btn className="phone-only noprint" onPress={() => jump('.live-status', '.live-status .btn')}>↑ Status</Btn>
        <input className="noprint skill-find" type="search" aria-label="Search skills" placeholder="search skills · tap to roll" value={find} onChange={(e) => setFind(e.target.value)} />
        <div className="row noprint">
          <Btn onPress={endSession} disabled={l.checked.length === 0}>End session: advance {l.checked.length} checked</Btn>
        </div>
        <SkillTable c={c} onRoll={rollSkill} filter={find} advance={l.advance} checked={l.checked} onUncheck={(k) => setL((p) => play.uncheckSkill(p, k))} />
      </Win>
      <Win className="live-file-win" title="PERSONNEL FILE" collapsible>
        {DETAIL_FIELDS.filter((f) => f.key !== 'name' && c.details[f.key].trim()).map((f) => (
          <p key={f.key}><span className="dim">{f.label.replace(' (optional)', '')}:</span> {c.details[f.key]}</p>
        ))}
        {STATS.map((s) => featureOf(s, c.stats[s]) && <p key={s}><span className="dim">{STAT_NAMES[s]}:</span> {featureOf(s, c.stats[s])}</p>)}
      </Win>
      <Win className="live-notes-win" title="NOTES">
        <textarea aria-label="Notes" rows={6} maxLength={MAX_NOTES} className="live-notes" value={l.notes} onChange={(e) => set('notes', e.target.value)} />
      </Win>
    </div>
    </main>
  );
}
