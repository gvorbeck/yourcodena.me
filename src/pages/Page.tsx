import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Legal } from '../ui/Legal';
import { SkipLink } from '../ui/Win';

/** Menu bar, centred content column and legal footer shared by the landing, game and notice pages. */
export const Page = ({ title, actions, children }: { title?: string; actions?: ReactNode; children: ReactNode }) => {
  useEffect(() => { document.title = title ? `${title} // YOURCODENA.ME` : 'YOURCODENA.ME // Agent Intake'; }, [title]);
  return (
    <>
      <SkipLink />
      <nav className="menubar" aria-label="Application">
        <Link to="/">YOURCODENA.ME</Link>
        <span className="dim">// Delta Green agents &amp; rolls</span>
        {actions && <span className="grow">{actions}</span>}
      </nav>
      <main id="main" tabIndex={-1} className="page">
        <h1 className="sr-only">{title || 'Agent intake'}</h1>
        {children}
      </main>
      <footer className="statusbar noprint"><Legal /></footer>
    </>
  );
};
