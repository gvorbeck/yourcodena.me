import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Panel, type Row } from './ui/Panel';
import { bondScoreOf, capsOf, conditionsOf, effStat, sheetOf, topSkills } from './model/live';
import { agentLabel } from './model/names';
import { activeBonds } from './rules';
import { bpNote, hpNote, pad2 } from './rules/outcome';
import type { AgentCard } from './lib/games';
import { agentUrl } from './lib/paths';

/** A row with a red note under it when `note` is set; the whole row turns red with it. */
const noted = (key: string, left: ReactNode, right: string, note: string): Row =>
  ({ key, left, right, warn: !!note, lines: note ? [{ left: note, warn: true }] : undefined });

/** The Handler's at-a-glance boxes on the game page. Lazy: it needs the rules to read each sheet. */
export default function HandlerPanels({ gameId, agents }: { gameId: string; agents: AgentCard[] }) {
  // Memoized: the game page re-renders on every new roll, but the sheets only change with `agents`.
  const { sheets, top, conditions } = useMemo(() => {
    const sheets = agents.flatMap((a) => {
      const s = sheetOf(a.character, a.live);
      const name = agentLabel(a.codename, a.name);
      return s ? [{ ...s, id: a.id, name, dex: effStat(s.c, s.l, 'DEX'), link: <Link to={agentUrl(gameId, a.id)}>{name}</Link> }] : [];
    });
    return { sheets, top: topSkills(sheets), conditions: sheets.map((s) => ({ s, ...conditionsOf(s.l) })).filter((x) => x.lines.length) };
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

      {/* Only agents with something to report, so the one that needs attention stands out. */}
      <Panel title="CONDITIONS" page="pp. 47, 55" rows={conditions.length ? conditions.map(({ s, penalty, lines }) => ({
        key: s.id, left: s.link, right: penalty ? `−${penalty}% to tests` : undefined, warn: true, lines: lines.map((left) => ({ left, warn: true })),
      })) : [{ key: 'none', left: 'No penalties or stat changes.' }]} />

      <Panel title="BONDS & DISORDERS" page="pp. 36, 69" rows={sheets.map((s) => ({
        key: s.id, left: s.link,
        lines: [...activeBonds(s.c).map((b) => ({ left: b.name, right: pad2(bondScoreOf(s.c, s.l, b.i)) })), ...s.l.disorders.map((d) => ({ left: d, warn: true }))],
      }))} />

      <Panel title="TOP SKILLS" page="p. 28" scroll rows={top.map((t) => ({ key: t.key, left: t.key, right: `${pad2(t.total)}%`, lines: [{ left: t.names.join(', ') }] }))} />
    </div>
  );
}
