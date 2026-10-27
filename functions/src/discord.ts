import { createPublicKey, verify } from 'node:crypto';
import { asLoss, d100Text, diceLabel, testText, type RollEntry, type TestEntry } from '../../src/rules/outcome';

/** A roll-log entry as stored at games/{gameId}/rolls/{rollId} (see src/rules/outcome.ts for the kinds). */
export type Roll = RollEntry;

const WEBHOOK = /^https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d{15,25}\/[\w-]{20,100}$/;
export const isWebhookUrl = (url: string) => WEBHOOK.test(url);

/**
 * Player-typed text goes into one line with no Markdown, links or headings. `allowed_mentions` already blocks pings,
 * but Discord still draws @everyone and <@id> as mention pills, so a zero-width space after each @ keeps them plain text.
 */
export const plain = (s: string, max = 100) =>
  s.replace(/\s+/g, ' ').trim().slice(0, max).replace(/([\\*_~`|>#[\]()-])/g, '\\$1').replace(/@/g, '@\u200b');

/** A name in bold, made safe with `plain`; `or` when it comes out empty. */
export const bold = (s: string, or = '') => `**${plain(s) || or}**`;

const OUTCOME: Record<string, string> = { 'critical success': '**CRITICAL SUCCESS**', success: 'Success', failure: 'Failure', fumble: '**FUMBLE**' };

/** Same facts as the game page's roll log: `**Agent Smith** · Firearms 45% (−20) → 23 · Success` */
export function formatRoll(r: Omit<TestEntry, 'kind'>): string {
  return `${bold(r.agentName, 'Unnamed agent')} · ${testText(plain(r.label), r.chance, r.penalty)} → ${d100Text(r.roll)} · ${OUTCOME[r.outcome] ?? plain(r.outcome)}`;
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

/**
 * Any roll-log entry as a Discord line: a d% test (formatRoll), `**Drew Rook** · 2D6+1 (4+4+1) → **9**`,
 * `**Drew Rook** loses **7** HP · 1D10 · HP 11 → 4 · Stunned (p. 55)`, or
 * `**Drew Rook** loses **4** SAN (violence) · 0/1D6 · SAN 55 → 51 · Failed the SAN test (rolled 63 against 55%).`
 */
export function formatEntry(r: Roll): string {
  if (!r.kind) return formatRoll(r);
  const who = bold(r.agentName, 'Someone'), dice = diceLabel(plain(r.label), r.dice, r.mod); // the detail is only digits and signs
  if (r.kind === 'dice') return `${who} · ${dice} → **${r.roll}**`;
  const l = asLoss(r);
  const rolled = l.label === String(l.roll) ? '' : ` · ${dice}`; // a flat "7" would only repeat the amount
  return `${who} loses **${l.roll}** ${l.stat}${l.cause ? ` (${plain(l.cause)})` : ''}${rolled} · ${l.stat} ${l.from} → ${l.to}${l.notes.map((n) => ` · ${n}`).join('')}`;
}
