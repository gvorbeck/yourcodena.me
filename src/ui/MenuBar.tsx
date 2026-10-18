import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { SkipLink } from './Win';

/** Skip link plus the top menu bar; `children` are the page's own actions, aligned right. */
export const MenuBar = ({ subtitle, children }: { subtitle: string; children?: ReactNode }) => (
  <>
    <SkipLink />
    <nav className="menubar" aria-label="Application">
      <Link to="/">
        <svg className="logo" viewBox="0 0 5 3" aria-hidden="true" focusable="false">
          <path d="M2 0h1v1H2zM1 1h3v1H1zM0 2h5v1H0z" fill="currentColor" />
        </svg>
        YOURCODENA.ME
      </Link>
      <span className="dim">{subtitle}</span>
      {children && <span className="grow">{children}</span>}
    </nav>
  </>
);
