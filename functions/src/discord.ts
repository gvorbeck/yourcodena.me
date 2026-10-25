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
  const pen = r.penalty ? ` (−${r.penalty})` : '';
  return `**${plain(r.agentName) || 'Unnamed agent'}** · ${plain(r.label)} ${r.chance}%${pen} → ${String(r.roll).padStart(2, '0')} · ${OUTCOME[r.outcome] ?? plain(r.outcome)}`;
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
