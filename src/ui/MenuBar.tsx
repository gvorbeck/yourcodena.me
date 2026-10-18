import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { SkipLink } from './Win';

/** Skip link plus the top menu bar; `children` are the page's own actions, aligned right. */
export const MenuBar = ({ subtitle, children }: { subtitle: string; children?: ReactNode }) => (
  <>
    <SkipLink />
    <nav className="menubar" aria-label="Application">
      <Link to="/">YOURCODENA.ME</Link>
      <span className="dim">{subtitle}</span>
      {children && <span className="grow">{children}</span>}
    </nav>
  </>
);
