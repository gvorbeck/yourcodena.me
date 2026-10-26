import { CODENAMES, randomInt } from '../rules/data/random';
import { SAVED_AGENT_KEY } from './storageKeys';

export const MIN_ID = 3;
export const MAX_ID = 100;
/** Server-side check (Functions): any ID this app could have made, older short ones included. */
export const isGameId = (s: string) => new RegExp(`^[a-z0-9-]{1,${MAX_ID}}$`).test(s);
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** What the Open box accepts: lowercase letters, digits and single dashes, so an ID is always a safe URL segment. */
export const slugifyGameId = (raw: string) => raw.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').slice(0, MAX_ID).replace(/^-+|-+$/g, '');

/** Like `kestrel-lantern-7f3k`. ~40 bits (older 4-character IDs still work): an unlisted link, not a secret (the rules deny listing games). */
export const newGameId = () => {
  const word = () => CODENAMES[randomInt(CODENAMES.length)].toLowerCase();
  return `${word()}-${word()}-${Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')}`;
};

// Games this browser has opened, newest first, so the landing page can offer a way back in.
const RECENT = 'dg.games';
export const recentGames = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch { return []; }
};
export const rememberGame = (id: string) => {
  try { localStorage.setItem(RECENT, JSON.stringify([id, ...recentGames().filter((x) => x !== id)].slice(0, 5))); } catch { /* storage blocked */ }
};

/** True when an Agent saved by the old local-only editor is still in this browser. */
export const hasSavedAgent = () => {
  try { return localStorage.getItem(SAVED_AGENT_KEY) !== null; } catch { return false; }
};
/** Once that Agent is added to a game, stop offering it; a `.bak` copy stays in case the write never lands. */
export const forgetSavedAgent = () => {
  try {
    const s = localStorage.getItem(SAVED_AGENT_KEY);
    if (s !== null) { localStorage.setItem(`${SAVED_AGENT_KEY}.bak`, s); localStorage.removeItem(SAVED_AGENT_KEY); }
  } catch { /* storage blocked */ }
};
