import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { asLoss, d100Text, diceLabel, testText } from '../rules/outcome';
import { agentLabel } from '../model/names';
import { useRun } from '../lib/useRun';
import { createGame, deleteAgent, useAgents, type AgentCard, useGameExists, useRolls, type RollDoc } from '../lib/games';
import { forgetSavedAgent, hasSavedAgent, MIN_ID, rememberGame, slugifyGameId } from '../lib/gameId';
import { Win } from '../ui/Win';
import { DiscordPanel } from '../DiscordPanel';
import { Notice, Page } from './Page';
import { Alert, CopyButton, Hint, Loading, OutcomeText, SubList } from '../ui/bits';
import { agentUrl, gameUrl } from '../lib/paths';

// Lazy: ui/index brings in the rules and react-aria, which this page otherwise doesn't load. Delete loads it through run() first, so a failed load shows an inline error instead of crashing the page.
const ConfirmDialog = lazy(() => import('../ui').then((m) => ({ default: m.ConfirmDialog })));

/** Test, Roll and Result cells: a d% test, plain dice from Discord ("2D6+1 (4+4+1) → 9"), or HP/SAN lost ("HP 11 → 4"). */
function EntryCells({ r }: { r: RollDoc }) {
  if (!r.kind) return (<>
    <td>{testText(r.label, r.chance, r.penalty)}</td>
    <td className="num"><b>{d100Text(r.roll)}</b></td>
    <td><OutcomeText o={r.outcome} /></td>
  </>);
  const dice = diceLabel(r.label, r.dice, r.mod);
  if (r.kind === 'dice') return <><td>{dice}</td><td className="num"><b>{r.roll}</b></td><td className="dim">DICE</td></>;
  const l = asLoss(r);
  return (<>
    <td>{l.stat} loss {dice}{l.cause && ` (${l.cause})`}</td>
    <td className="num"><b>{l.roll}</b></td>
    <td className="warn">{l.stat} {l.from} → {l.to}{l.notes.map((n) => <small key={n}><br />{n}</small>)}</td>
  </>);
}

const when = (t: number) => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function Game() {
  const { gameId = '' } = useParams();
  const nav = useNavigate();
  const exists = useGameExists(gameId);
  const agents = useAgents(gameId);
  const rolls = useRolls(gameId);
  const { busy, err, run } = useRun('Something went wrong. Check your connection and try again.');
  const [doomed, setDoomed] = useState<AgentCard | null>(null);
  const [deleteFailed, setDeleteFailed] = useState(false);
  // Once a deleted agent's row is gone, focus moves to New agent instead of falling back to the page body.
  const removed = useRef<string | null>(null);
  const newAgent = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (removed.current && agents.data && !agents.data.some((a) => a.id === removed.current)) { removed.current = null; newAgent.current?.focus(); }
  }, [agents.data]);
  const has = (id: string) => !agents.data || agents.data.some((a) => a.id === id);
  const link = location.origin + gameUrl(gameId); // no query or hash the visitor arrived with
  useEffect(() => { if (exists.data) rememberGame(gameId); }, [exists.data, gameId]);

  // Not awaited: the write only settles once the server acknowledges it, which never happens offline. The list updates from the local cache.
  const remove = (a: AgentCard) => {
    removed.current = a.id;
    setDeleteFailed(false);
    deleteAgent(gameId, a.id).catch(() => setDeleteFailed(true));
  };

  // The sheet model is loaded on demand so this page stays small.
  const addAgent = (fromSaved: boolean) => run(async () => {
    const [{ createAgent }, { loadCharacter }] = await Promise.all([import('../lib/agents'), import('../model/character')]);
    const id = createAgent(gameId, fromSaved ? loadCharacter() : undefined);
    if (fromSaved) forgetSavedAgent();
    nav(agentUrl(gameId, id));
  });

  if (exists.error) return <Notice page={gameId} title="CANNOT REACH GAME"><p className="warn">Could not load game {gameId}. Check your connection and reload.</p></Notice>;
  if (exists.data === undefined) return <Page title={gameId}><Loading what="game" /></Page>;
  if (!exists.data) {
    const valid = slugifyGameId(gameId) === gameId && gameId.length >= MIN_ID;
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
                  <Link to={agentUrl(gameId, a.id)}>{agentLabel(a.codename, a.name)}</Link>
                  <span className="dim">{[a.codename && a.name, a.profession].filter(Boolean).join(' · ') || 'Not started'}</span>
                  {a.vitals ? <span>HP {a.vitals.hp} · WP {a.vitals.wp} · SAN {a.vitals.san}</span> : <span className="dim">Creation incomplete</span>}
                </div>
                <button className="btn" onClick={() => run(async () => { await import('../ui'); setDoomed(a); })} disabled={busy} aria-label={`Delete ${agentLabel(a.codename, a.name)}`}>Delete</button>
              </li>
            ))}
          </ul>
        )}</SubList>
        <div className="row">
          <button ref={newAgent} className="btn" onClick={() => addAgent(false)} disabled={busy}>New agent</button>
          {hasSavedAgent() && <button className="btn" onClick={() => addAgent(true)} disabled={busy}>Add the agent saved in this browser</button>}
        </div>
        <Alert>{err}</Alert>
        <Alert>{deleteFailed && 'Could not delete the agent. Check your connection and try again.'}</Alert>
        {doomed && <Suspense><ConfirmDialog open title="Delete this agent?" confirm="Delete" onClose={() => setDoomed(null)}
          onConfirm={() => remove(doomed)}>
          Delete {agentLabel(doomed.codename, doomed.name)} for everyone in this game? This cannot be undone. Their past rolls stay in the log.
        </ConfirmDialog></Suspense>}
      </Win>

      <Win title="ROLL LOG" right="latest 50">
        <SubList sub={rolls} error="Could not load the roll log. Reload to retry." empty="No rolls yet. Rolls made on an agent's live sheet appear here for everyone.">{(list) => (
          <div className="log">
            <table>
              <thead><tr><th>When</th><th>Agent</th><th>Test</th><th className="num">Roll</th><th>Result</th></tr></thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id}>
                    <td className="dim">{when(r.createdAt)}</td>
                    <td>{!r.agentId ? r.agentName : has(r.agentId) ? <Link to={agentUrl(gameId, r.agentId)}>{r.agentName}</Link> : <span title="Deleted">{r.agentName}</span>}</td>
                    <EntryCells r={r} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}</SubList>
      </Win>

      <DiscordPanel gameId={gameId} />
    </Page>
  );
}
