import { useId, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useRun } from '../lib/useRun';
import { isOpenableId, MIN_ID, newGameId, recentGames, slugifyGameId } from '../lib/gameId';
import { Win } from '../ui/Win';
import { Page } from './Page';
import { Alert, Hint } from '../ui/bits';
import { gameUrl } from '../lib/paths';

const Hero = () => (
  <header className="hero">
    {/* Pixel art drawn on a 64×36 grid; each path is one colour. */}
    <svg viewBox="0 0 64 36" aria-hidden="true" focusable="false">
      <path className="panel" d="M3 2h17v1H3zM3 3h1v1H3zM11 3h9v1H11zM2 5h60v1H2zM2 6h60v1H2zM2 7h60v1H2zM2 8h60v1H2zM2 9h15v1H2zM18 9h15v1H18zM41 9h1v1H41zM48 9h1v1H48zM58 9h4v1H58zM2 10h15v1H2zM18 10h44v1H18zM2 11h14v1H2zM19 11h43v1H19zM2 12h14v1H2zM19 12h14v1H19zM59 12h3v1H59zM2 13h13v1H2zM20 13h13v1H20zM59 13h3v1H59zM2 14h12v1H2zM21 14h41v1H21zM2 15h12v1H2zM17 15h1v1H17zM21 15h12v1H21zM38 15h1v1H38zM51 15h11v1H51zM2 16h11v1H2zM17 16h1v1H17zM22 16h40v1H22zM2 17h11v1H2zM16 17h3v1H16zM22 17h40v1H22zM2 18h10v1H2zM15 18h5v1H15zM23 18h10v1H23zM46 18h1v1H46zM57 18h5v1H57zM2 19h9v1H2zM15 19h5v1H15zM24 19h9v1H24zM46 19h16v1H46zM2 20h9v1H2zM14 20h7v1H14zM24 20h38v1H24zM2 21h8v1H2zM14 21h2v1H14zM19 21h2v1H19zM25 21h8v1H25zM45 21h1v1H45zM59 21h3v1H59zM2 22h7v1H2zM13 22h2v1H13zM16 22h1v1H16zM18 22h1v1H18zM20 22h2v1H20zM26 22h36v1H26zM2 23h7v1H2zM12 23h4v1H12zM19 23h4v1H19zM26 23h36v1H26zM2 24h6v1H2zM12 24h11v1H12zM27 24h6v1H27zM55 24h7v1H55zM2 25h6v1H2zM11 25h13v1H11zM27 25h6v1H27zM55 25h7v1H55zM2 26h5v1H2zM10 26h15v1H10zM28 26h34v1H28zM2 27h4v1H2zM10 27h15v1H10zM29 27h7v1H29zM60 27h2v1H60zM2 28h4v1H2zM29 28h7v1H29zM37 28h22v1H37zM60 28h2v1H60zM2 29h3v1H2zM30 29h6v1H30zM37 29h22v1H37zM60 29h2v1H60zM2 30h34v1H2zM37 30h22v1H37zM60 30h2v1H60zM2 31h34v1H2zM37 31h22v1H37zM60 31h2v1H60zM2 32h34v1H2zM60 32h2v1H60zM2 33h60v1H2z" />
      <path className="accent" d="M17 9h1v1H17zM17 10h1v1H17zM16 11h3v1H16zM16 12h3v1H16zM15 13h5v1H15zM14 14h7v1H14zM14 15h3v1H14zM18 15h3v1H18zM13 16h4v1H13zM18 16h4v1H18zM13 17h3v1H13zM19 17h3v1H19zM12 18h3v1H12zM20 18h3v1H20zM11 19h4v1H11zM20 19h4v1H20zM11 20h3v1H11zM21 20h3v1H21zM10 21h4v1H10zM21 21h4v1H21zM9 22h4v1H9zM22 22h4v1H22zM9 23h3v1H9zM23 23h3v1H23zM8 24h4v1H8zM23 24h4v1H23zM8 25h3v1H8zM24 25h3v1H24zM7 26h3v1H7zM25 26h3v1H25zM6 27h4v1H6zM25 27h4v1H25zM36 27h24v1H36zM6 28h23v1H6zM36 28h1v1H36zM59 28h1v1H59zM5 29h25v1H5zM36 29h1v1H36zM59 29h1v1H59zM36 30h1v1H36zM59 30h1v1H59zM36 31h1v1H36zM59 31h1v1H59zM36 32h24v1H36z" />
      <path className="fg" d="M2 1h19v1H2zM2 2h1v1H2zM20 2h1v1H20zM2 3h1v1H2zM20 3h1v1H20zM1 4h62v1H1zM1 5h1v1H1zM62 5h1v1H62zM1 6h1v1H1zM62 6h1v1H62zM1 7h1v1H1zM62 7h1v1H62zM1 8h1v1H1zM62 8h1v1H62zM1 9h1v1H1zM62 9h1v1H62zM1 10h1v1H1zM62 10h1v1H62zM1 11h1v1H1zM62 11h1v1H62zM1 12h1v1H1zM62 12h1v1H62zM1 13h1v1H1zM62 13h1v1H62zM1 14h1v1H1zM62 14h1v1H62zM1 15h1v1H1zM62 15h1v1H62zM1 16h1v1H1zM62 16h1v1H62zM1 17h1v1H1zM62 17h1v1H62zM1 18h1v1H1zM62 18h1v1H62zM1 19h1v1H1zM62 19h1v1H62zM1 20h1v1H1zM62 20h1v1H62zM1 21h1v1H1zM62 21h1v1H62zM1 22h1v1H1zM62 22h1v1H62zM1 23h1v1H1zM62 23h1v1H62zM1 24h1v1H1zM62 24h1v1H62zM1 25h1v1H1zM62 25h1v1H62zM1 26h1v1H1zM62 26h1v1H62zM1 27h1v1H1zM62 27h1v1H62zM1 28h1v1H1zM62 28h1v1H62zM1 29h1v1H1zM62 29h1v1H62zM1 30h1v1H1zM62 30h1v1H62zM1 31h1v1H1zM62 31h1v1H62zM1 32h1v1H1zM62 32h1v1H62zM1 33h1v1H1zM62 33h1v1H62zM1 34h62v1H1zM63 6h1v1H63zM63 7h1v1H63zM63 8h1v1H63zM63 9h1v1H63zM63 10h1v1H63zM63 11h1v1H63zM33 12h26v1H33zM63 12h1v1H63zM33 13h26v1H33zM63 13h1v1H63zM63 14h1v1H63zM63 15h1v1H63zM63 16h1v1H63zM63 17h1v1H63zM33 18h13v1H33zM63 18h1v1H63zM33 19h13v1H33zM63 19h1v1H63zM63 20h1v1H63zM16 21h3v1H16zM63 21h1v1H63zM15 22h1v1H15zM17 22h1v1H17zM19 22h1v1H19zM63 22h1v1H63zM16 23h3v1H16zM63 23h1v1H63zM33 24h22v1H33zM63 24h1v1H63zM33 25h22v1H33zM63 25h1v1H63zM63 26h1v1H63zM63 27h1v1H63zM63 28h1v1H63zM63 29h1v1H63zM63 30h1v1H63zM63 31h1v1H63zM63 32h1v1H63zM63 33h1v1H63zM63 34h1v1H63zM3 35h61v1H3z" />
      <path className="dim" d="M4 3h7v1H4zM33 9h8v1H33zM42 9h6v1H42zM49 9h9v1H49zM33 15h5v1H33zM39 15h12v1H39zM47 18h10v1H47zM33 21h12v1H33zM46 21h13v1H46z" />
      <text x="38.5" y="31" textLength="19" lengthAdjust="spacingAndGlyphs">CLASSIFIED</text>
    </svg>
    <div>
      <h1>Delta Green agent creator and party tracker</h1>
      <p className="dim cursor">Create a game. Build your agents. Roll where the whole table can see.</p>
    </div>
  </header>
);

export default function Home() {
  const nav = useNavigate();
  const [raw, setRaw] = useState('');
  const { busy, err, run } = useRun('Could not create a game. Check your connection and try again.');
  const inputId = useId();
  const slug = slugifyGameId(raw);
  const recent = recentGames();

  const open = (e: FormEvent) => { e.preventDefault(); if (isOpenableId(slug)) nav(gameUrl(slug)); };
  // Firestore loads on click, not with the landing page.
  const generate = () => run(async () => { const id = newGameId(); await (await import('../lib/games')).createGame(id); nav(gameUrl(id)); });

  return (
    <Page heading={<Hero />}>
      <Win title="OPEN A GAME">
        <label className="lbl" htmlFor={inputId}>Game ID</label>
        <form className="idform" onSubmit={open}>
          <input id={inputId} placeholder="game id" value={raw} onChange={(e) => setRaw(e.target.value)} autoCapitalize="none" autoComplete="off" spellCheck={false} />
          <button className="btn primary" disabled={!isOpenableId(slug)}>Open</button>
        </form>
        <Hint>{slug && slug !== raw ? `Opens ${slug}. ` : ''}Letters, numbers and dashes, at least {MIN_ID}. An ID nobody has used yet offers to create that game.</Hint>
        {recent.length > 0 && (
          <>
            <h3>Recent</h3>
            <Hint>Games you opened in this browser.</Hint>
            <ul className="agents">{recent.map((id) => <li key={id}><Link to={gameUrl(id)}>{id}</Link></li>)}</ul>
          </>
        )}
      </Win>
      <Win title="START A NEW GAME">
        <p>Get a fresh game ID to share with your table. Anyone with the ID can see the game's agents and rolls, so it works like an unlisted link.</p>
        <div className="row"><button className="btn primary" onClick={generate} disabled={busy}>{busy ? 'Creating…' : 'Generate game'}</button></div>
        <Alert>{err}</Alert>
      </Win>
    </Page>
  );
}
