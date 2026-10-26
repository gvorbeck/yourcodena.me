import { useState } from 'react';
import { isStaleChunk, reloadForNewBuild } from './staleBuild';

/** Runs a button's async work: disables while busy, shows `failMsg` on error, and reloads once if the error is a stale build. */
export function useRun(failMsg: string) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setErr('');
    try { await fn(); } catch (e) { if (!(isStaleChunk(e) && reloadForNewBuild())) setErr(failMsg); }
    setBusy(false);
  };
  return { busy, err, run };
}
