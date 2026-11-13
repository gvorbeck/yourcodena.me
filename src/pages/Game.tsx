import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { asLoss, pad2, diceLabel, testText, wpNote } from '../rules/outcome';
import { useRun } from '../lib/useRun';
import { downloadJson } from '../lib/download';
import { createGame, deleteAgent, exportGame, useAgents, type AgentCard, useGameExists, useHeldSan, useRolls, type RollDoc } from '../lib/games';
import { forgetSavedAgent, hasSavedAgent, isOpenableId, MIN_ID, rememberGame } from '../lib/gameId';
import { Win } from '../ui/Win';
import { DiscordPanel } from '../DiscordPanel';
import GmScreen from '../GmScreen';
import { Notice, Page } from './Page';
import { Alert, CopyButton, Hint, LineForm, Loading, OutcomeText, SubList, useJsonPicker } from '../ui/bits';
import { agentUrl, gameUrl } from '../lib/paths';

// Lazy: ui/index brings in the rules and react-aria, which this page otherwise doesn't load. Delete loads it through run() first, so a failed load shows an inline error instead of crashing the page.
const ConfirmDialog = lazy(() => import('../ui').then((m) => ({ default: m.ConfirmDialog })));
// Lazy too: it needs the rules to read each sheet.
const HandlerPanels = lazy(() => import('../HandlerPanels'));

/** Test, Roll and Result cells: a d% test, plain dice from Discord ("2D6+1 (4+4+1) → 9"), or HP/SAN lost ("HP 11 → 4"). */
function EntryCells({ r }: { r: RollDoc }) {
  if (!r.kind) return (<>
    <td>{testText(r.label, r.chance, r.penalty)}</td>
    <td className="num"><b>{pad2(r.roll)}</b></td>
    <td><OutcomeText o={r.outcome} /></td>
  </>);
  const dice = diceLabel(r.label, r.dice, r.mod);
  if (r.kind === 'dice') return <><td>{dice}</td><td className="num"><b>{r.roll}</b></td><td className="dim">DICE</td></>;
  const l = asLoss(r);
  return (<>
    <td>{l.stat} loss {dice}{l.cause && ` (${l.cause})`}</td>
    <td className="num"><b>{l.roll}</b></td>
    <td className="warn">{l.stat} {l.from} → {l.to}{l.notes.map((n, i) => <small key={i}><br />{n}</small>)}</td>
  </>);
}

// UTC and 24-hour, so the whole table agrees across time zones and the time fits on one line.
const when = (t: number) => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' });

export default function Game() {
  const { gameId = '' } = useParams();
  const nav = useNavigate();
  const exists = useGameExists(gameId);
  const agents = useAgents(gameId);
  const rolls = useRolls(gameId);
  const held = useHeldSan(gameId);
  const [slow, setSlow] = useState(false); // a never-opened game can't be read offline, and the page can only wait
  useEffect(() => { setSlow(false); const t = setTimeout(() => setSlow(true), 10_000); return () => clearTimeout(t); }, [gameId]);
  const { busy, err, run } = useRun('Something went wrong. Check your connection and try again.');
  const [doomed, setDoomed] = useState<AgentCard | null>(null);
  const [deleteFailed, setDeleteFailed] = useState(false);
  const [advancing, setAdvancing] = useState<AgentCard[] | null>(null); // the agents the confirm dialog will advance
  const [notice, setNotice] = useState('');
  // Once a deleted agent's row is gone, focus moves to New agent instead of falling back to the page body.
  const removed = useRef<string | null>(null);
  const newAgent = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (removed.current && agents.data && !agents.data.some((a) => a.id === removed.current)) { removed.current = null; newAgent.current?.focus(); }
  }, [agents.data]);
  const cards = agents.data;
  const has = (id: string) => !agents.data || agents.data.some((a) => a.id === id);
  const link = location.origin + gameUrl(gameId); // no query or hash the visitor arrived with
  useEffect(() => { if (exists.data) rememberGame(gameId); }, [exists.data, gameId]);

  // Not awaited: the write only settles once the server acknowledges it, which never happens offline. The list updates from the local cache.
  const remove = (a: AgentCard) => {
    removed.current = a.id;
    setDeleteFailed(false);
    deleteAgent(gameId, a.id).catch(() => setDeleteFailed(true));
  };

  const advance = (list: AgentCard[]) => run(async () => {
    const { gains, failed } = await (await import('../lib/agents')).advanceAll(gameId, list.map((a) => a.id));
    const lines = list.filter((a) => gains[a.id]?.length).map((a) => `${a.label}: ${gains[a.id].map(([k, n]) => `${k} +${n}`).join(', ')}`);
    const missed = list.filter((a) => failed.includes(a.id)).map((a) => a.label);
    setNotice([
      lines.length ? `Skills advanced (p. 28). ${lines.join('; ')}.` : !missed.length && 'No agent had checked skills that could advance.',
      missed.length && `Could not save ${missed.join(', ')}. Check your connection and press again.`,
    ].filter(Boolean).join(' '));
  });

  // The sheet model is loaded on demand so this page stays small.
  const addAgent = (fromSaved: boolean) => run(async () => {
    const [{ createAgent }, { loadCharacter }] = await Promise.all([import('../lib/agents'), import('../model/character')]);
    const id = createAgent(gameId, fromSaved ? loadCharacter() : undefined);
    if (fromSaved) forgetSavedAgent();
    nav(agentUrl(gameId, id));
  });

  const [bad, setBad] = useState('');
  const [sheet, setSheet] = useState('');
  const backup = () => run(async () => downloadJson(`${gameId}.dg-game.json`, await exportGame(gameId)));
  // A game backup, an exported Agent or a Green Agent file: each Agent in it is added as a new one.
  const importFile = (f: File) => run(async () => {
    setBad(''); setNotice('');
    const { createAgent, readImport } = await import('../lib/agents');
    const found = await f.text().then((t) => readImport(JSON.parse(t))).catch(() => null);
    if (!found) return setBad('That file is not an Agent or a game backup.');
    found.forEach(({ c, live }) => createAgent(gameId, c, live));
    setNotice(`Added ${found.length === 1 ? '1 agent' : `${found.length} agents`}.`);
  });
  const picker = useJsonPicker(importFile, 'Agent or backup file');
  // A standalone sheet's link (the old /#sheet=… kind) becomes an Agent here, live play included.
  const addSheet = () => run(async () => {
    setBad(''); setNotice('');
    const [{ createAgent }, { decodeSheet }] = await Promise.all([import('../lib/agents'), import('../model/live')]);
    const t = sheet.trim();
    const s = decodeSheet(t.slice(Math.max(0, t.indexOf('#sheet='))));
    if (!s) return setBad('That is not a sheet link.');
    createAgent(gameId, s.c, s.l);
    setSheet(''); setNotice('Added the sheet as a new agent.');
  });

  if (exists.error) return <Notice page={gameId} title="CANNOT REACH GAME"><p className="warn">Could not load game {gameId}. Check your connection and reload.</p></Notice>;
  if (exists.data === undefined) return <Page title={gameId}><Loading what="game" /><Alert>{slow && 'Still trying to reach the game. Check your connection.'}</Alert></Page>;
  if (!exists.data) {
    const valid = isOpenableId(gameId);
    return (
      <Notice page={gameId} title="NO SUCH GAME">
          <p>No game has the ID <b>{gameId}</b>.</p>
          <div className="row">
            <button className="btn" onClick={() => run(() => createGame(gameId))} disabled={busy || !valid}>Create game {gameId}</button>
            <Link className="btn" to="/">Back</Link>
          </div>
          {!valid && <Hint>IDs use lowercase letters, numbers and dashes, at least {MIN_ID} characters.</Hint>}
          <Alert>{err}</Alert>
      </Notice>
    );
  }

  return (
    <Page title={gameId}>
      <Win title={`GAME // ${gameId.toUpperCase()}`}>
        <p className="dim">Anyone with this link can see the game's agents and rolls. Share it with your table.</p>
        <div className="row">
          <code className="link">{link}</code>
          <CopyButton text={() => link} label="Copy game link" />
        </div>
        <h3>Agents</h3>
        <SubList sub={agents} error="Could not load agents. Reload to retry." empty="No agents yet.">{(list) => (
          <ul className="agents">
            {list.map((a) => (
              <li key={a.id}>
                <div className="info">
                  <Link to={agentUrl(gameId, a.id)}>{a.label}</Link>
                  <span className="dim">{[a.codename && a.name, a.profession].filter(Boolean).join(' · ') || 'Not started'}</span>
                  {a.vitals ? <span>HP {a.vitals.hp} · <span className={wpNote(a.vitals.wp) ? 'warn' : undefined}>WP {a.vitals.wp}{wpNote(a.vitals.wp) && ` (${wpNote(a.vitals.wp)})`}</span> · SAN {a.vitals.san}</span> : <span className="dim">Creation incomplete</span>}
                </div>
                <button className="btn" onClick={() => run(async () => { await import('../ui'); setDoomed(a); })} disabled={busy} aria-label={`Delete ${a.label}`}>Delete</button>
              </li>
            ))}
          </ul>
        )}</SubList>
        <div className="row">
          <button ref={newAgent} className="btn" onClick={() => addAgent(false)} disabled={busy}>New agent</button>
          {hasSavedAgent() && <button className="btn" onClick={() => addAgent(true)} disabled={busy}>Add the agent saved in this browser</button>}
          {!!cards?.length && <button className="btn" onClick={() => run(async () => { await import('../ui'); setNotice(''); setAdvancing(cards); })} disabled={busy}>End session: advance all checked skills</button>}
        </div>
        <p role="status">{notice}</p>
        <h3>Backup and import</h3>
        <div className="row">
          <button className="btn" onClick={backup} disabled={busy}>Download game backup</button>
          <button className="btn" onClick={picker.open} disabled={busy}>Add agents from a file</button>
          {picker.input}
        </div>
        <LineForm url label="Sheet link" value={sheet} onChange={setSheet} onSubmit={addSheet}>
          <button className="btn" disabled={busy || !sheet.trim()}>Add sheet</button>
        </LineForm>
        <Hint>A file is a backup of this or another game, or one Agent exported from the Review step. Backups keep every Agent; the roll log is saved in the file but not restored.</Hint>
        <Alert>{bad}</Alert>
        <Alert>{err}</Alert>
        <Alert>{deleteFailed && 'Could not delete the agent. Check your connection and try again.'}</Alert>
        {doomed && <Suspense><ConfirmDialog open title="Delete this agent?" confirm="Delete" onClose={() => setDoomed(null)}
          onConfirm={() => remove(doomed)}>
          Delete {doomed.label} for everyone in this game? This cannot be undone. Their past rolls stay in the log.
        </ConfirmDialog></Suspense>}
        {advancing && <Suspense><ConfirmDialog open title="End the session?" confirm="Advance all" onClose={() => setAdvancing(null)}
          onConfirm={() => advance(advancing)}>
          Every agent in this game gains 1D4 in each checked skill, and the checks are cleared (p. 28). This cannot be undone.
        </ConfirmDialog></Suspense>}
      </Win>

      <Win title="ROLL LOG" right="latest 50">
        <SubList sub={rolls} error="Could not load the roll log. Reload to retry." empty="No rolls yet. Rolls made on an agent's live sheet appear here for everyone.">{(list) => (
          <div className="log">
            <table>
              <thead><tr><th>When (UTC)</th><th>Agent</th><th>Test</th><th className="num">Roll</th><th>Result</th></tr></thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id}>
                    <td className="dim">{when(r.createdAt)}</td>
                    <td>{!r.agentId ? r.agentName : has(r.agentId) ? <Link to={agentUrl(gameId, r.agentId)}>{r.agentName}</Link> : <span title="Deleted">{r.agentName}<span className="sr-only"> (deleted)</span></span>}</td>
                    <EntryCells r={r} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}</SubList>
      </Win>

      {/* Only once some agent has a live sheet: before that the boxes are empty and their rules code need not load. */}
      {cards?.some((a) => a.vitals) && <Suspense><HandlerPanels gameId={gameId} agents={cards} held={held.data} /></Suspense>}

      <GmScreen />
      <DiscordPanel gameId={gameId} />
    </Page>
  );
}
