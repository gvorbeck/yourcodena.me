const KEY = 'dg.reloaded';
const WINDOW_MS = 10_000;

// Chrome, Firefox and Safari word a failed dynamic import differently.
const STALE_CHUNK = /dynamically imported module|Importing a module script failed/i;
export const isStaleChunk = (e: unknown) => e instanceof Error && STALE_CHUNK.test(e.message);

/**
 * After a deploy the hashed files an open tab still asks for are gone. Reload once to pick up the new build.
 * Returns false (and does nothing) if it already reloaded in the last few seconds, so a genuinely broken
 * deploy shows its error instead of looping.
 */
export function reloadForNewBuild(reload = () => location.reload(), now = Date.now()): boolean {
  try {
    if (now - Number(sessionStorage.getItem(KEY)) < WINDOW_MS) return false;
    sessionStorage.setItem(KEY, String(now));
  } catch { /* storage blocked: reload anyway */ }
  reload();
  return true;
}
