import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Win } from './ui/Win';
import { bondScoreOf, capsOf, effStat, sheetOf, topSkills } from './model/live';
import { agentLabel } from './model/names';
import { activeBonds } from './rules';
import { bpNote, hpNote, pad2 } from './rules/outcome';
import type { AgentCard } from './lib/games';
import { agentUrl } from './lib/paths';

/** One line of a row: text on the left, an optional value on the right; `warn` turns it red. */
interface Line { left: ReactNode; right?: ReactNode; warn?: boolean }
/** A row is its first line plus any lines under it (bonds, disorders, notes), all above one dotted rule. */
interface Row extends Line { key: string; lines?: Line[] }

/** Every Handler box: a titled window with a page reference and a list of rows. `scroll` caps its height. */
function Panel({ title, page, rows, scroll }: { title: string; page: string; rows: Row[]; scroll?: boolean }) {
  return (
    <Win title={title} right={page}>
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

/** A row with a red note under it when `note` is set; the whole row turns red with it. */
const noted = (key: string, left: ReactNode, right: string, note: string): Row =>
  ({ key, left, right, warn: !!note, lines: note ? [{ left: note, warn: true }] : undefined });

/** The Handler's at-a-glance boxes on the game page. Lazy: it needs the rules to read each sheet. */
export default function HandlerPanels({ gameId, agents }: { gameId: string; agents: AgentCard[] }) {
  // Memoized: the game page re-renders on every new roll, but the sheets only change with `agents`.
  const { sheets, top } = useMemo(() => {
    const sheets = agents.flatMap((a) => {
      const s = sheetOf(a.character, a.live);
      const name = agentLabel(a.codename, a.name);
      return s ? [{ ...s, id: a.id, name, dex: effStat(s.c, s.l, 'DEX'), link: <Link to={agentUrl(gameId, a.id)}>{name}</Link> }] : [];
    });
    return { sheets, top: topSkills(sheets) };
  }, [gameId, agents]);
  if (!sheets.length) return null;

  return (
    <div className="masonry">
      {/* Combat counts down by DEX as played (injury and temporary loss applied), highest first (p. 50). Ties keep creation order; the Handler breaks them. */}
      <Panel title="INITIATIVE" page="p. 50" rows={[...sheets].sort((a, b) => b.dex - a.dex).map((s) => ({ key: s.id, left: s.link, right: `DEX ${pad2(s.dex)}` }))} />

      <Panel title="HEALTH" page="p. 55" rows={sheets.map((s) => {
        const max = capsOf(s.c, s.l).hp;
        return noted(s.id, s.link, `HP ${pad2(s.l.hp)}/${pad2(max)}`, hpNote(s.l.hp, max));
      })} />

      <Panel title="SANITY" page="pp. 64, 68" rows={sheets.map((s) =>
        noted(s.id, s.link, `SAN ${pad2(s.l.san)} / BP ${pad2(s.l.bp)}`, bpNote(s.l.san, s.l.bp)))} />

      <Panel title="BONDS & DISORDERS" page="pp. 36, 69" rows={sheets.map((s) => ({
        key: s.id, left: s.link,
        lines: [...activeBonds(s.c).map((b) => ({ left: b.name, right: pad2(bondScoreOf(s.c, s.l, b.i)) })), ...s.l.disorders.map((d) => ({ left: d, warn: true }))],
      }))} />

      <Panel title="TOP SKILLS" page="p. 28" scroll rows={top.map((t) => ({ key: t.key, left: t.key, right: `${pad2(t.total)}%`, lines: [{ left: t.names.join(', ') }] }))} />
    </div>
  );
}
