import { useEffect, type ReactNode } from 'react';
import { Legal } from '../ui/Legal';
import { MenuBar } from '../ui/MenuBar';

/** Menu bar, centred content column and legal footer shared by the landing, game and notice pages. */
export const Page = ({ title, actions, children }: { title?: string; actions?: ReactNode; children: ReactNode }) => {
  useEffect(() => { document.title = title ? `${title} // YOURCODENA.ME` : 'YOURCODENA.ME // Agent Intake'; }, [title]);
  return (
    <>
      <MenuBar subtitle="// Delta Green agents &amp; rolls">{actions}</MenuBar>
      <main id="main" tabIndex={-1} className="page">
        <h1 className="sr-only">{title || 'Agent intake'}</h1>
        {children}
      </main>
      <footer className="statusbar noprint"><Legal /></footer>
    </>
  );
};
