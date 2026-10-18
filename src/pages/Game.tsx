import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { outcomeClass } from '../rules/outcome';
import { isStaleChunk, reloadForNewBuild } from '../lib/staleBuild';
import { copyNote, useCopy } from '../lib/useCopy';
import { createGame, useAgents, useGameExists, useRolls } from '../lib/games';
import { hasSavedAgent, MIN_ID, rememberGame, slugifyGameId } from '../lib/gameId';
import { Win } from '../ui/Win';
import { Page } from './Page';

const when = (t: number) => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function Game() {
  const { gameId = '' } = useParams();
  const nav = useNavigate();
  const exists = useGameExists(gameId);
  const agents = useAgents(gameId);
  const rolls = useRolls(gameId);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [copied, copy] = useCopy();
  useEffect(() => { if (exists.data) rememberGame(gameId); }, [exists.data, gameId]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setErr('');
    try { await fn(); } catch (e) { if (!(isStaleChunk(e) && reloadForNewBuild())) setErr('Something went wrong. Check your connection and try again.'); }
    setBusy(false);
  };
  // The sheet model is loaded on demand so this page stays small.
  const addAgent = (fromSaved: boolean) => run(async () => {
    const [{ createAgent }, { loadCharacter }] = await Promise.all([import('../lib/agents'), import('../model/character')]);
    nav(`/g/${gameId}/a/${createAgent(gameId, fromSaved ? loadCharacter() : undefined)}`);
  });

  if (exists.error) return <Page title={gameId}><Win title="CANNOT REACH GAME"><p className="warn">Could not load game {gameId}. Check your connection and reload.</p></Win></Page>;
  if (exists.data === undefined) return <Page title={gameId}><p className="dim" role="status">Loading game…</p></Page>;
  if (!exists.data) {
    const valid = slugifyGameId(gameId) === gameId && gameId.length >= MIN_ID;
    return (
      <Page title={gameId}>
        <Win title="NO SUCH GAME">
          <p>No game has the ID <b>{gameId}</b>.</p>
          <div className="row">
            <button className="btn" onClick={() => run(() => createGame(gameId))} disabled={busy || !valid}>Create game {gameId}</button>
            <Link className="btn" to="/">Back</Link>
          </div>
          {!valid && <p className="dim"><small>IDs use lowercase letters, numbers and dashes, at least {MIN_ID} characters.</small></p>}
          {err && <p className="warn" role="alert">{err}</p>}
        </Win>
      </Page>
    );
  }

  return (
    <Page title={gameId} actions={<><button onClick={() => copy(location.href)}>{copied === 'ok' ? 'Link copied ✓' : copied === 'fail' ? 'Copy failed' : 'Copy game link'}</button><span className="sr-only" role="status">{copyNote(copied)}</span></>}>
      <Win title={`GAME // ${gameId.toUpperCase()}`}>
        <h3>Agents</h3>
        {agents.error ? <p className="warn">Could not load agents. Reload to retry.</p> : agents.data === undefined ? <p className="dim">Loading…</p> : agents.data.length === 0 ? <p className="dim">No agents yet.</p> : (
          <ul className="agents">
            {agents.data.map((a) => (
              <li key={a.id}>
                <Link to={`/g/${gameId}/a/${a.id}`}>{a.codename || a.name || 'Unnamed agent'}</Link>
                <span className="dim">{[a.codename && a.name, a.profession].filter(Boolean).join(' · ') || 'Not started'}</span>
                {a.vitals ? <span>HP {a.vitals.hp} · WP {a.vitals.wp} · SAN {a.vitals.san}</span> : <span className="dim">Creation incomplete</span>}
              </li>
            ))}
          </ul>
        )}
        <div className="row">
          <button className="btn" onClick={() => addAgent(false)} disabled={busy}>New agent</button>
          {hasSavedAgent() && <button className="btn" onClick={() => addAgent(true)} disabled={busy}>Add the agent saved in this browser</button>}
        </div>
        {err && <p className="warn" role="alert">{err}</p>}
      </Win>

      <Win title="ROLL LOG" right="latest 50">
        {rolls.error ? <p className="warn">Could not load the roll log. Reload to retry.</p> : rolls.data === undefined ? <p className="dim">Loading…</p> : rolls.data.length === 0 ? <p className="dim">No rolls yet. Rolls made on an agent's live sheet appear here for everyone.</p> : (
          <div className="log">
            <table>
              <thead><tr><th>When</th><th>Agent</th><th>Test</th><th className="num">Roll</th><th>Result</th></tr></thead>
              <tbody>
                {rolls.data.map((r) => (
                  <tr key={r.id}>
                    <td className="dim">{when(r.createdAt)}</td>
                    <td><Link to={`/g/${gameId}/a/${r.agentId}`}>{r.agentName}</Link></td>
                    <td>{r.label} {r.chance}%{r.penalty ? ` (−${r.penalty})` : ''}</td>
                    <td className="num"><b>{String(r.roll).padStart(2, '0')}</b></td>
                    <td className={outcomeClass(r.outcome)}>{r.outcome.toUpperCase()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Win>
    </Page>
  );
}
