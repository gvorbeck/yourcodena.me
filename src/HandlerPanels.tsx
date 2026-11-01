import { Link } from 'react-router-dom';
import { Win } from './ui/Win';
import { capsOf, effStat, sheetOf, topSkills } from './model/live';
import { agentLabel } from './model/names';
import { activeBonds } from './rules';
import { bpNote, hpNote } from './rules/outcome';
import type { AgentCard } from './lib/games';
import { agentUrl } from './lib/paths';

/** The Handler's at-a-glance boxes on the game page. Lazy: it needs the rules to read each sheet. */
export default function HandlerPanels({ gameId, agents }: { gameId: string; agents: AgentCard[] }) {
  const sheets = agents.flatMap((a) => {
    const s = sheetOf(a.character, a.live);
    return s ? [{ ...s, id: a.id, dex: effStat(s.c, s.l, 'DEX'), name: agentLabel(a.codename, a.name) }] : [];
  });
  if (!sheets.length) return null;
  const two = (n: number) => String(n).padStart(2, '0'); // monospace: "09" lines up with "14"
  const link = (s: (typeof sheets)[number]) => <Link to={agentUrl(gameId, s.id)}>{s.name}</Link>;

  return (
    <div className="masonry">
      {/* Combat counts down by DEX as played (injury and temporary loss applied), highest first (p. 50). Ties keep creation order; the Handler breaks them. */}
      <Win title="INITIATIVE" right="p. 50">
        <table>
          <tbody>
            {[...sheets].sort((a, b) => b.dex - a.dex).map((s) => <tr key={s.id}><td>{link(s)}</td><td className="num">DEX {two(s.dex)}</td></tr>)}
          </tbody>
        </table>
      </Win>

      <Win title="HEALTH" right="p. 55">
        <table>
          <tbody>
            {sheets.map((s) => {
              const note = hpNote(s.l.hp, capsOf(s.c, s.l).hp);
              return (
                <tr key={s.id}>
                  <td>{link(s)}{note && <small className="warn"><br />{note}</small>}</td>
                  <td className={`num${note ? ' warn' : ''}`}>HP {two(s.l.hp)}/{two(capsOf(s.c, s.l).hp)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Win>

      <Win title="SANITY" right="pp. 64, 68">
        <table>
          <tbody>
            {sheets.map((s) => {
              const note = bpNote(s.l.san, s.l.bp);
              return (
                <tr key={s.id}>
                  <td>{link(s)}{note && <small className="warn"><br />{note}</small>}</td>
                  <td className={`num${note ? ' warn' : ''}`}>SAN {two(s.l.san)} / BP {two(s.l.bp)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Win>

      <Win title="BONDS & DISORDERS" right="pp. 36, 69">
        <ul className="plain-list bond-list">
          {sheets.map((s) => (
            <li key={s.id}>
              {link(s)}
              {activeBonds(s.c).map((b) => <div key={b.i} className="pair"><span>{b.name}</span><span>{two(s.l.bonds[b.i] ?? 0)}</span></div>)}
              {s.l.disorders.map((d) => <div key={d} className="warn">{d}</div>)}
            </li>
          ))}
        </ul>
      </Win>

      <Win title="TOP SKILLS" right="p. 28">
        <div className="log">
          <table>
            <thead><tr><th>Skill</th><th className="num">%</th><th>Agent</th></tr></thead>
            <tbody>
              {topSkills(sheets).map((t) => (
                <tr key={t.key}><td>{t.key}</td><td className="num"><b>{t.total}</b></td><td>{t.names.join(', ')}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Win>
    </div>
  );
}
