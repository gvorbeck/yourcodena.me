import type { ReactNode } from 'react';
import { Win } from './Win';

/** One line of a row: text on the left, an optional value on the right; `warn` turns it red. */
interface Line { left: ReactNode; right?: ReactNode; warn?: boolean }
/** A row is its first line plus any lines under it (bonds, disorders, notes), all above one dotted rule. */
export interface Row extends Line { key: string; lines?: Line[] }

/** Every Handler box: a titled window with a page reference and a list of rows. `scroll` caps its height. */
export function Panel({ title, page, rows, scroll, sub }: { title: string; page: string; rows: Row[]; scroll?: boolean; sub?: boolean }) {
  return (
    <Win title={title} right={page} sub={sub}>
      <ul className={scroll ? 'plain-list panel-rows log' : 'plain-list panel-rows'}>
        {rows.map((r) => (
          <li key={r.key}>
            {[r, ...(r.lines ?? [])].map((l, i) => (
              <div key={i} className={l.warn ? 'pair warn' : 'pair'}><span>{l.left}</span>{l.right !== undefined && <span>{l.right}</span>}</div>
            ))}
          </li>
        ))}
      </ul>
    </Win>
  );
}
