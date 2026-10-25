import { app } from './firebase';

export interface DiscordStatus { connected: boolean; name: string }

/**
 * The `discordWebhook` Function (functions/src/index.ts). No `url`: status. `''`: disconnect. A URL: connect.
 * The Functions SDK loads on first use so pages that never touch Discord stay small.
 */
export async function discordWebhook(gameId: string, url?: string): Promise<DiscordStatus> {
  const { getFunctions, httpsCallable } = await import('firebase/functions');
  const call = httpsCallable<{ gameId: string; url?: string }, DiscordStatus>(getFunctions(app, 'us-central1'), 'discordWebhook');
  return (await call(url === undefined ? { gameId } : { gameId, url })).data;
}

/** The Function's own message for errors it raises on purpose; a generic one for anything else. */
export const discordError = (e: unknown) => {
  const code = (e as { code?: string })?.code ?? '';
  return /invalid-argument|failed-precondition|unavailable|not-found/.test(code) && e instanceof Error
    ? e.message
    : 'Something went wrong. Check your connection and try again.';
};
