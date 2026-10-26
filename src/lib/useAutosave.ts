import { useEffect, useRef } from 'react';

/** Writes `value` once it has been still for `ms`, and right away when the page hides or the component unmounts. Values compare by reference.
 *  `report` hears whether each write succeeded, so a warning can clear once a retry goes through.
 *  `loaded` is what is already stored; pass it when the first `value` differs from it and must be written. */
export function useAutosave<T>(value: T, save: (v: T) => Promise<unknown>, report: (ok: boolean, e?: unknown) => void, loaded: T = value, ms = 600) {
  const saved = useRef(loaded); // the loaded or last-written value
  const latest = useRef(value);
  const fns = useRef({ save, report });
  latest.current = value;
  fns.current = { save, report };
  const flush = useRef(() => {
    if (latest.current === saved.current) return;
    const v = latest.current, before = saved.current;
    saved.current = v;
    // A rejected write is marked unsaved again so the next flush (change, hide or unmount) retries it.
    fns.current.save(v).then(() => fns.current.report(true), (e) => { if (saved.current === v) saved.current = before; fns.current.report(false, e); });
  });
  useEffect(() => {
    const t = setTimeout(flush.current, ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  useEffect(() => {
    const f = flush.current;
    addEventListener('pagehide', f);
    return () => { removeEventListener('pagehide', f); f(); };
  }, []);
}
