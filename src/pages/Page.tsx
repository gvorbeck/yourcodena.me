import { useEffect, type ReactNode } from 'react';
import { Legal } from '../ui/Legal';
import { MenuBar } from '../ui/MenuBar';
import { useFocusMain } from '../ui/Win';

export const useTitle = (title?: string) =>
  useEffect(() => { document.title = title ? `${title} // YOURCODENA.ME` : 'YOURCODENA.ME // Agent Intake'; }, [title]);

interface PageProps {
  title?: string;
  /** Replaces the default screen-reader-only <h1> (the title). */
  heading?: ReactNode;
  subtitle?: string;
  /** The page's own menu bar items, aligned right. */
  actions?: ReactNode;
  /** Status bar items before the legal line. */
  status?: ReactNode;
  /** Full width instead of the centred content column. */
  wide?: boolean;
  children: ReactNode;
}

/** Menu bar, <main> and status bar shared by every page except the live sheet. */
export const Page = ({ title, heading, subtitle = '// Delta Green agents & rolls', actions, status, wide, children }: PageProps) => {
  useTitle(title);
  useFocusMain();
  return (
    <>
      <MenuBar subtitle={subtitle}>{actions}</MenuBar>
      <main id="main" tabIndex={-1} className={wide ? undefined : 'page'}>
        {heading ?? <h1 className="sr-only">{title || 'Agent intake'}</h1>}
        {children}
      </main>
      <footer className="statusbar noprint">{status}<Legal /></footer>
    </>
  );
};
