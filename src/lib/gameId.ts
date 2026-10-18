import { CODENAMES } from '../rules/data/random';
import { SAVED_AGENT_KEY } from './storageKeys';

export const MIN_ID = 3;
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const pick = (n: number) => crypto.getRandomValues(new Uint32Array(1))[0] % n;

/** What the Open box accepts: lowercase letters, digits and single dashes, so an ID is always a safe URL segment. */
export const slugifyGameId = (raw: string) => raw.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** Like `kestrel-lantern-7f3k`. ~30 bits: an unlisted link, not a secret (the rules deny listing games). */
export const newGameId = () => {
  const word = () => CODENAMES[pick(CODENAMES.length)].toLowerCase();
  return `${word()}-${word()}-${Array.from({ length: 4 }, () => ALPHABET[pick(ALPHABET.length)]).join('')}`;
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
