import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MIN_ID, newGameId, recentGames, slugifyGameId } from '../lib/gameId';
import { Win } from '../ui/Win';
import { Page } from './Page';

export default function Home() {
  const nav = useNavigate();
  const [raw, setRaw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const slug = slugifyGameId(raw);
  const recent = recentGames();

  const open = (e: FormEvent) => { e.preventDefault(); if (slug.length >= MIN_ID) nav(`/g/${slug}`); };
  const generate = async () => {
    setBusy(true); setErr('');
    const id = newGameId();
    // Firestore loads on click, not with the landing page.
    try { await (await import('../lib/games')).createGame(id); nav(`/g/${id}`); } catch { setErr('Could not create a game. Check your connection and try again.'); }
    setBusy(false);
  };

  return (
    <Page>
      <Win title="OPEN A GAME">
        <form className="idform" onSubmit={open}>
          <input aria-label="Game ID" placeholder="game id" value={raw} onChange={(e) => setRaw(e.target.value)} autoCapitalize="none" autoComplete="off" spellCheck={false} />
          <button className="btn" disabled={slug.length < MIN_ID}>Open</button>
        </form>
        <p className="dim"><small>{slug && slug !== raw ? `Opens ${slug}. ` : ''}Letters, numbers and dashes, at least {MIN_ID}. An ID nobody has used yet offers to create that game.</small></p>
        {recent.length > 0 && (
          <>
            <h3>Recent</h3>
            <ul className="agents">{recent.map((id) => <li key={id}><Link to={`/g/${id}`}>{id}</Link></li>)}</ul>
          </>
        )}
      </Win>
      <Win title="START A NEW GAME">
        <p>Get a fresh game ID to share with your table. Anyone with the ID can see the game's agents and rolls, so it works like an unlisted link.</p>
        <div className="row"><button className="btn" onClick={generate} disabled={busy}>{busy ? 'Creating…' : 'Generate game'}</button></div>
        {err && <p className="warn" role="alert">{err}</p>}
      </Win>
    </Page>
  );
}
