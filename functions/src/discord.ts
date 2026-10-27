import { createPublicKey, verify } from 'node:crypto';
import { d100Text, testText } from '../../src/rules/outcome';
import { modText, type Damage } from './dg.js';

/** A roll as stored at games/{gameId}/rolls/{rollId} (see src/lib/games.ts). `chance` is already after the penalty. */
export interface Roll { agentName: string; label: string; chance: number; penalty: number; roll: number; outcome: string }

const WEBHOOK = /^https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d{15,25}\/[\w-]{20,100}$/;
export const isWebhookUrl = (url: string) => WEBHOOK.test(url);

/**
 * Player-typed text goes into one line with no Markdown, links or headings. `allowed_mentions` already blocks pings,
 * but Discord still draws @everyone and <@id> as mention pills, so a zero-width space after each @ keeps them plain text.
 */
export const plain = (s: string, max = 100) =>
  s.replace(/\s+/g, ' ').trim().slice(0, max).replace(/([\\*_~`|>#[\]()-])/g, '\\$1').replace(/@/g, '@\u200b');

const OUTCOME: Record<string, string> = { 'critical success': '**CRITICAL SUCCESS**', success: 'Success', failure: 'Failure', fumble: '**FUMBLE**' };

/** Same facts as the game page's roll log: `**Agent Smith** · Firearms 45% (−20) → 23 · Success` */
export function formatRoll(r: Roll): string {
  return `**${plain(r.agentName) || 'Unnamed agent'}** · ${testText(plain(r.label), r.chance, r.penalty)} → ${d100Text(r.roll)} · ${OUTCOME[r.outcome] ?? plain(r.outcome)}`;
}

/** Posts one message. Returns Discord's HTTP status: 204 sent, 404 webhook deleted, 429 rate limited. */
export async function postWebhook(url: string, content: string, f: typeof fetch = fetch): Promise<number> {
  const res = await f(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
    signal: AbortSignal.timeout(5000),
  });
  return res.status;
}

/** The webhook's name as set in Discord, or null when Discord doesn't know the URL. */
export async function webhookName(url: string, f: typeof fetch = fetch): Promise<string | null> {
  const res = await f(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) return null;
  const body = (await res.json()) as { name?: unknown };
  return typeof body.name === 'string' ? body.name : '';
}

const MAX_SKEW_MS = 5 * 60 * 1000;
const ED25519_SPKI = Buffer.from('302a300506032b6570032100', 'hex'); // DER prefix that turns Discord's raw 32-byte key into a key Node accepts

/** Discord signs every interaction with the app's key (Developer Portal → General Information → Public Key). Anything unsigned is rejected. */
export function verifyDiscord(publicKeyHex: string, signatureHex: string, timestamp: string, body: Buffer, now = Date.now()): boolean {
  if (!/^[0-9a-f]{64}$/i.test(publicKeyHex) || !/^[0-9a-f]{128}$/i.test(signatureHex) || !/^\d{1,12}$/.test(timestamp)) return false;
  if (Math.abs(now - Number(timestamp) * 1000) > MAX_SKEW_MS) return false; // a captured request can't be replayed later
  const key = createPublicKey({ key: Buffer.concat([ED25519_SPKI, Buffer.from(publicKeyHex, 'hex')]), format: 'der', type: 'spki' });
  return verify(null, Buffer.concat([Buffer.from(timestamp), body]), key, Buffer.from(signatureHex, 'hex'));
}

/** `**Drew Rook** · Glock 17 · 1D10+1 → **8** (7+1)`, or for Lethality `… · Lethality 15% → 80 · **18** HP damage (8+10)`. */
export function formatDamage(name: string, label: string, d: Damage): string {
  const who = `**${plain(name) || 'Someone'}**${label.trim() ? ` · ${plain(label, 60)}` : ''}`;
  const crit = d.critical ? ', critical ×2' : '';
  if (d.kind === 'lethality') {
    const rating = d.critical ? `${d.rating}% ×2 = ${Math.min(100, d.rating * 2)}%` : `${d.rating}%`;
    const result = d.killed ? '**LETHAL**: a human target drops to 0 HP' : `**${d.total}** HP damage (${d.dice.join('+')}${crit})`;
    return `${who} · Lethality ${rating} → ${d100Text(d.roll)} · ${result}`;
  }
  const detail = d.dice.length ? ` (${d.dice.join('+')}${modText(d.mod)}${crit})` : d.critical ? ' (critical ×2)' : '';
  return `${who} · ${d.expr} → **${d.total}** damage${detail}`;
}
