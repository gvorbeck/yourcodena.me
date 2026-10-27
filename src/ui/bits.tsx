import type { ReactNode } from 'react';
import { copyLabel, copyNote, useCopy } from '../lib/useCopy';
import { outcomeClass } from '../rules/outcome';

// Small shared pieces with no react-aria, so the landing and game pages can use them without the form-control chunk.

/** An error to announce; renders nothing when empty. `inline` for inside a line of text. */
export const Alert = ({ children, inline }: { children: ReactNode; inline?: boolean }) =>
  children ? (inline ? <span className="warn" role="alert">{children}</span> : <p className="warn" role="alert">{children}</p>) : null;

/** `quiet` for a placeholder inside a page that already announced its own loading. */
/** A small dim note under a control. */
export const Hint = ({ children, className }: { children: ReactNode; className?: string }) =>
  <p className={className ? `dim ${className}` : 'dim'}><small>{children}</small></p>;

/** A d% result in its colour: SUCCESS, FUMBLE… */
export const OutcomeText = ({ o }: { o: string }) => <span className={outcomeClass(o)}>{o.toUpperCase()}</span>;

export const Loading = ({ what, className = 'dim', quiet }: { what?: string; className?: string; quiet?: boolean }) =>
  <p className={className} role={quiet ? undefined : 'status'}>Loading{what && ` ${what}`}…</p>;

/** Copies `text()` (read at click time) and says so, on the button and to screen readers. */
export function CopyButton({ text, label, ok }: { text: () => string; label: string; ok?: string }) {
  const [copied, copy] = useCopy();
  return (
    <>
      <button className="btn" onClick={() => copy(text())}>{copyLabel(copied, label, ok)}</button>
      <span className="sr-only" role="status">{copyNote(copied)}</span>
    </>
  );
}

/** A live list's error, loading or empty message, or the list itself. */
export function SubList<T>({ sub, error, empty, children }: { sub: { data?: T[]; error?: Error }; error: string; empty: string; children: (data: T[]) => ReactNode }) {
  if (sub.error) return <p className="warn">{error}</p>;
  if (sub.data === undefined) return <Loading quiet />;
  return sub.data.length ? children(sub.data) : <p className="dim">{empty}</p>;
}
