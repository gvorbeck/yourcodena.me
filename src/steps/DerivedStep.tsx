import { derived } from '../rules';
import { type StepProps } from '../ui';

export function DerivedStep({ c }: StepProps) {
  const d = derived(c);
  const rows: [string, number, string][] = [
    ['Hit Points', d.hp, '(STR + CON) ÷ 2, rounded up'],
    ['Willpower Points', d.wp, '= POW'],
    ['Sanity Points', d.san, 'POW × 5'],
    ['Breaking Point', d.bp, 'SAN − POW'],
  ];
  return (
    <>
      <p className="dim">Handbook p. 18 — updates as you edit the statistics above.</p>
      <table>
        <tbody>
          {rows.map(([n, v, f]) => <tr key={n}><td>{n}</td><td className="num">{v}</td><td className="dim">{f}</td></tr>)}
          <tr><td>Maximum SAN</td><td className="num">{d.maxSan}</td><td className="dim">99 − Unnatural</td></tr>
        </tbody>
      </table>
      {c.veteran && <p className="dim">Includes Damaged Veteran adjustments from step IV.</p>}
    </>
  );
}
