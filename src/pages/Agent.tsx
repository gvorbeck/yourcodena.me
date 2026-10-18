import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Editor } from '../Editor';
import { LiveSheet } from '../LiveSheet';
import { loadAgent, saveCharacter, saveLive } from '../lib/agents';
import { logRoll } from '../lib/games';
import { useAutosave } from '../lib/useAutosave';
import { freshLive, untouched, type Live } from '../model/live';
import { blocking, validate } from '../rules';
import type { Character } from '../model/character';
import { Win } from '../ui/Win';
import { Page } from './Page';

type Loaded = { c: Character; live: Live | null };

export default function Agent() {
  const { gameId = '', agentId = '' } = useParams();
  const key = `${gameId}/${agentId}`;
  const [s, setS] = useState<{ key: string; agent?: Loaded | null; error?: boolean }>({ key: '' });
  useEffect(() => {
    let current = true;
    loadAgent(gameId, agentId).then((agent) => current && setS({ key, agent }), () => current && setS({ key, error: true }));
    return () => { current = false; };
  }, [gameId, agentId, key]);

  if (s.key !== key) return <Page><p className="dim" role="status">Loading agent…</p></Page>;
  if (s.error || !s.agent) {
    return (
      <Page>
        <Win title={s.error ? 'CANNOT OPEN AGENT' : 'NO SUCH AGENT'}>
          <p className={s.error ? 'warn' : undefined}>{s.error ? 'This agent could not be loaded. Check your connection and reload.' : 'This game has no agent with that ID.'}</p>
          <div className="row"><Link className="btn" to={`/g/${gameId}`}>&lt; Game {gameId}</Link></div>
        </Win>
      </Page>
    );
  }
  return <AgentBody key={key} gameId={gameId} agentId={agentId} init={s.agent} />;
}

/** One agent, loaded once. Local state is the source of truth while the page is open; changes are written back as they settle. */
function AgentBody({ gameId, agentId, init }: { gameId: string; agentId: string; init: Loaded }) {
  const [c, setC] = useState(init.c);
  // A complete agent always has a live sheet, including one saved before that was automatic, so it opens straight into it.
  const [live, setLive] = useState(() => init.live ?? (blocking(validate(init.c)).length === 0 ? freshLive(init.c) : null));
  const [mode, setMode] = useState<'edit' | 'live'>(live ? 'live' : 'edit');
  const [failed, setFailed] = useState(false);
  const fail = () => setFailed(true);
  const issues = validate(c);
  const complete = blocking(issues).length === 0;
  // The live sheet exists as soon as creation is complete, so the game page shows the agent's vitals without anyone pressing a button.
  useEffect(() => { if (complete && !live) setLive(freshLive(c)); }, [complete, live]);
  // Until it has been played, the sheet follows the character: rolling better stats after the last step must not leave HP/SAN at the old values.
  const prevC = useRef(c);
  useEffect(() => {
    const prev = prevC.current;
    prevC.current = c;
    if (prev !== c) setLive((l) => (l && untouched(l, prev) ? freshLive(c) : l));
  }, [c]);
  useAutosave(c, (v) => saveCharacter(gameId, agentId, v), fail);
  useAutosave(live, (v) => (v ? saveLive(gameId, agentId, v) : Promise.resolve()), fail, init.live);

  if (mode === 'live' && live) {
    // `init` is read once when the sheet mounts; later changes flow back through onChange.
    return (
      <LiveSheet c={c} init={live} game={{
        gameId, failed, back: () => setMode('edit'), onChange: setLive,
        onRoll: ({ pen, ...r }) => logRoll(gameId, { ...r, penalty: pen, agentId, agentName: c.details.codename.trim() || c.details.name.trim() || 'Unnamed agent' }).catch(fail),
      }} />
    );
  }
  return <Editor agentId={agentId} c={c} issues={issues} setC={setC} gameId={gameId} failed={failed} onLive={() => { setLive((p) => p ?? freshLive(c)); setMode('live'); }} />;
}
