import { useId, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useRun } from '../lib/useRun';
import { MIN_ID, newGameId, recentGames, slugifyGameId } from '../lib/gameId';
import { Win } from '../ui/Win';
import { Page } from './Page';
import { Alert } from '../ui/bits';
import { gameUrl } from '../lib/paths';

export default function Home() {
  const nav = useNavigate();
  const [raw, setRaw] = useState('');
  const { busy, err, run } = useRun('Could not create a game. Check your connection and try again.');
  const inputId = useId();
  const slug = slugifyGameId(raw);
  const recent = recentGames();

  const open = (e: FormEvent) => { e.preventDefault(); if (slug.length >= MIN_ID) nav(gameUrl(slug)); };
  // Firestore loads on click, not with the landing page.
  const generate = () => run(async () => { const id = newGameId(); await (await import('../lib/games')).createGame(id); nav(gameUrl(id)); });

  return (
    <Page heading={<h1 className="intro">Delta Green agent creator and shared roll log</h1>}>
      <Win title="OPEN A GAME">
        <label className="lbl" htmlFor={inputId}>Game ID</label>
        <form className="idform" onSubmit={open}>
          <input id={inputId} placeholder="game id" value={raw} onChange={(e) => setRaw(e.target.value)} autoCapitalize="none" autoComplete="off" spellCheck={false} />
          <button className="btn" disabled={slug.length < MIN_ID}>Open</button>
        </form>
        <p className="dim"><small>{slug && slug !== raw ? `Opens ${slug}. ` : ''}Letters, numbers and dashes, at least {MIN_ID}. An ID nobody has used yet offers to create that game.</small></p>
        {recent.length > 0 && (
          <>
            <h3>Recent</h3>
            <p className="dim"><small>Games you opened in this browser.</small></p>
            <ul className="agents">{recent.map((id) => <li key={id}><Link to={gameUrl(id)}>{id}</Link></li>)}</ul>
          </>
        )}
      </Win>
      <Win title="START A NEW GAME">
        <p>Get a fresh game ID to share with your table. Anyone with the ID can see the game's agents and rolls, so it works like an unlisted link.</p>
        <div className="row"><button className="btn" onClick={generate} disabled={busy}>{busy ? 'Creating…' : 'Generate game'}</button></div>
        <Alert>{err}</Alert>
      </Win>
    </Page>
  );
}
