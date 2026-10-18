import { useEffect, useRef, useState } from 'react';

export type CopyState = 'idle' | 'ok' | 'fail';

/** Clipboard write with a short-lived result, so a button can show "copied" or "failed" instead of a blocking alert. */
export function useCopy(): [CopyState, (text: string) => void] {
  const [state, setState] = useState<CopyState>('idle');
  const timer = useRef<number>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = (text: string) => {
    Promise.resolve().then(() => navigator.clipboard.writeText(text)).then(() => 'ok' as const, () => 'fail' as const).then((s) => {
      setState(s);
      clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setState('idle'), s === 'ok' ? 1500 : 4000);
    });
  };
  return [state, copy];
}

/** For a `role="status"` sr-only span beside the button, since a changed button label isn't announced. */
export const copyNote = (s: CopyState) => (s === 'ok' ? 'Copied' : s === 'fail' ? 'Copy failed: select and copy it by hand' : '');
