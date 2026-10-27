import { useCallback, useEffect, useRef, useState } from 'react';

export type Sub<T> = (id: string, ok: (v: T) => void, bad: (e: Error) => void) => () => void;

/** Live subscription keyed by an ID. Data from a previous ID is never shown; `data` is undefined until the first value. */
export function useSub<T>(id: string, sub: Sub<T>): { data?: T; error?: Error } {
  const [s, setS] = useState<{ id: string; data?: T; error?: Error }>({ id });
  useEffect(() => sub(id, (data) => setS({ id, data }), (error) => setS({ id, error })), [id, sub]);
  return s.id === id ? s : {};
}

/** One load per key, like useSub: an answer that arrives after the key changed is dropped. */
export function useLoad<T>(key: string, load: (key: string) => Promise<T>) {
  const fn = useRef(load);
  fn.current = load;
  const sub = useCallback<Sub<T>>((k, ok, bad) => {
    let current = true;
    fn.current(k).then((v) => current && ok(v), (e) => current && bad(e instanceof Error ? e : new Error(String(e)))); // a falsy rejection must not read as loading
    return () => { current = false; };
  }, []);
  return useSub(key, sub);
}
