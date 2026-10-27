/** localStorage key of the Agent saved by the old local-only editor. Shared so the game page can test for it without loading the sheet model. */
export const SAVED_AGENT_KEY = 'dg.character';
/** Where an unreadable or already-added saved Agent is kept, in case it's still needed. */
export const SAVED_AGENT_BAK = `${SAVED_AGENT_KEY}.bak`;

/** localStorage that never throws (private mode, storage blocked): reads give null and `set` says whether it stuck. */
export const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); return true; } catch { return false; } },
  remove: (k: string) => { try { localStorage.removeItem(k); } catch { /* storage blocked */ } },
};
