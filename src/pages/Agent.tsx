import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Editor } from '../Editor';
import { LiveSheet, type RemoteLive } from '../LiveSheet';
import { DamagedAgent, loadAgent, saveCharacter, saveLive, watchLive } from '../lib/agents';
import { mergeRemote } from '../lib/diff';
import { logRoll } from '../lib/games';
import { useAutosave } from '../lib/useAutosave';
import { freshLive, reconcile, untouched, type Live } from '../model/live';
import { blocking, validate } from '../rules';
import type { Character } from '../model/character';
import { agentLabel } from '../model/names';
import { Win } from '../ui/Win';
import { Page } from './Page';

type Loaded = { c: Character; live: Live | null };

export default function Agent() {
  const { gameId = '', agentId = '' } = useParams();
  const key = `${gameId}/${agentId}`;
  const [s, setS] = useState<{ key: string; agent?: Loaded | null; error?: 'network' | 'damaged' }>({ key: '' });
  useEffect(() => {
    let current = true;
    loadAgent(gameId, agentId).then((agent) => current && setS({ key, agent }), (e) => current && setS({ key, error: e instanceof DamagedAgent ? 'damaged' : 'network' }));
    return () => { current = false; };
  }, [gameId, agentId, key]);

  if (s.key !== key) return <Page><p className="dim" role="status">Loading agent…</p></Page>;
  if (s.error || !s.agent) {
    return (
      <Page>
        <Win title={s.error ? 'CANNOT OPEN AGENT' : 'NO SUCH AGENT'}>
          <p className={s.error ? 'warn' : undefined}>{s.error === 'damaged' ? "This agent's saved data is damaged and can't be opened." : s.error ? 'This agent could not be loaded. Check your connection and reload.' : 'This game has no agent with that ID.'}</p>
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
  // One flag per kind of write, so one succeeding never hides another still failing. A roll is never retried,
  // so its warning stays until a later roll is logged.
  const [fails, setFails] = useState({ c: false, live: false, roll: false });
  const [gone, setGone] = useState(false); // someone deleted this agent from the game while it was open
  const report = (k: keyof typeof fails) => (ok: boolean, e?: unknown) => {
    setFails((f) => (f[k] === !ok ? f : { ...f, [k]: !ok }));
    if ((e as { code?: string } | undefined)?.code === 'not-found') setGone(true);
  };
  const failed = gone ? 'Not saved: this agent was deleted from the game.'
    : fails.c || fails.live || fails.roll ? 'Not saved: check your connection and reload.' : '';
  const issues = validate(c);
  const complete = blocking(issues).length === 0;
  // The live sheet exists as soon as creation is complete, so the game page shows the agent's vitals without anyone pressing a button.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `c` is read only at the moment creation becomes complete
  useEffect(() => { if (complete && !live) setLive(freshLive(c)); }, [complete, live]);
  // Until it has been played, the sheet follows the character: rolling better stats after the last step must not leave HP/SAN at the old values.
  const prevC = useRef(c);
  useEffect(() => {
    const prev = prevC.current;
    prevC.current = c;
    if (prev !== c) setLive((l) => (l && (untouched(l, prev) ? freshLive(c) : reconcile(l, c))));
  }, [c]);
  // Changes someone else saves (Discord damage, a skill checked from Discord, another device) merge into the open sheet,
  // so this tab's next save can't write its stale copy over them. Leaves changed here as well keep this tab's value.
  const [remote, setRemote] = useState<RemoteLive | null>(null);
  useEffect(() => watchLive(gameId, agentId, (r, base) => {
    const merge = (l: Live) => mergeRemote(base, l, r);
    setLive((l) => l && merge(l));
    setRemote({ merge });
  }), [gameId, agentId]);
  useAutosave(c, (v) => saveCharacter(gameId, agentId, v), report('c'));
  useAutosave(live, (v) => (v ? saveLive(gameId, agentId, v) : Promise.resolve()), report('live'), init.live);

  if (mode === 'live' && live) {
    // `init` is read once when the sheet mounts; later changes flow back through onChange.
    return (
      <LiveSheet c={c} init={live} game={{
        gameId, failed, back: () => setMode('edit'), onChange: setLive, remote,
        onRoll: ({ pen, ...r }) => logRoll(gameId, { ...r, penalty: pen, agentId, agentName: agentLabel(c.details.codename, c.details.name) }).then(() => report('roll')(true), () => report('roll')(false)),
      }} />
    );
  }
  return <Editor agentId={agentId} c={c} issues={issues} setC={setC} gameId={gameId} failed={failed} onLive={() => { setLive((p) => p ?? freshLive(c)); setMode('live'); }} />;
}
