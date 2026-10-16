import { z } from 'zod';
import { parseCharacter, type Character } from './character';
import { bondCount, derived } from '../rules';

/** Play-time state. The whole sheet lives in the URL hash, so no server or database is involved. */
export const MAX_NOTES = 4000;
const n = z.number().int().min(0).max(999);
const liveSchema = z.object({
  hp: n, wp: n, san: n, bp: n,
  bonds: z.array(n).max(20), notes: z.string().max(MAX_NOTES).default(''),
});
export type Live = z.infer<typeof liveSchema>;

export const freshLive = (c: Character): Live => {
  const d = derived(c);
  return { hp: d.hp, wp: d.wp, san: d.san, bp: d.bp, bonds: Array(bondCount(c)).fill(d.bondScore), notes: '' };
};

const PREFIX = '#sheet=';
// shortcut: plain base64url JSON, no compression (~2 KB URLs), add deflate if links get too long to paste.
// Chunked: spreading a large array into fromCharCode overflows the argument limit.
const bin = (b: Uint8Array) => Array.from({ length: Math.ceil(b.length / 8192) }, (_, i) => String.fromCharCode(...b.subarray(i * 8192, (i + 1) * 8192))).join('');
const b64 = (s: string) => btoa(bin(new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (ch) => ch.charCodeAt(0)));

export const encodeSheet = (c: Character, l: Live) => PREFIX + b64(JSON.stringify({ c, l }));

export function decodeSheet(hash: string): { c: Character; l: Live } | null {
  if (!hash.startsWith(PREFIX)) return null;
  try {
    const raw = JSON.parse(unb64(hash.slice(PREFIX.length)));
    return { c: parseCharacter(raw.c), l: liveSchema.parse(raw.l) };
  } catch { return null; }
}

