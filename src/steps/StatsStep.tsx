import { useState } from 'react';
import { STATS, STAT_NAMES, STAT_SETS, POINT_BUY_TOTAL } from '../rules/data/creation';
import { featureOf, roll4d6dl, sum } from '../rules';
import { DerivedTable } from './DerivedTable';
import { Btn, Choice, Num, Rule, RadioGroup, Label, type StepProps } from '../ui';

export function StatsStep({ c, up }: StepProps) {
  const total = sum(STATS.map((s) => c.stats[s]));
  // Scores from before the last roll, so a re-roll can be undone; cleared by any other edit.
  const [before, setBefore] = useState<typeof c.stats | null>(null);
  /** Any edit but a roll ends the chance to undo the roll. */
  const edit: typeof up = (fn) => { setBefore(null); up(fn); };
  return (
    <>
      <p className="dim">Handbook p. 14 — roll 4D6 and drop the lowest six times, divide 72 points, or use an assignable set. Test = stat × 5.</p>
      <Rule />
      <RadioGroup value={c.statMethod} onChange={(v) => edit((d) => { d.statMethod = v as typeof c.statMethod; })}>
        <Label className="lbl">Method</Label>
        <Choice value="roll">Roll 4D6, drop lowest</Choice>
        <Choice value="points">Divide {POINT_BUY_TOTAL} points</Choice>
        <Choice value="set">Assignable set</Choice>
      </RadioGroup>
      <div className="row my-m">
        {c.statMethod === 'roll' && (
          <>
            <Btn onPress={() => { setBefore((b) => b ?? { ...c.stats }); up((d) => { STATS.forEach((s) => { d.stats[s] = roll4d6dl(); }); }); }}>Roll six scores</Btn>
            {before && <Btn onPress={() => edit((d) => { Object.assign(d.stats, before); })}>Undo roll</Btn>}
          </>
        )}
        {c.statMethod === 'set' && STAT_SETS.map((s) => (
          <Btn key={s.id} onPress={() => edit((d) => { d.statSet = s.id; STATS.forEach((st, i) => { d.stats[st] = s.values[i]; }); })}>
            {s.name} ({s.values.join('/')}){c.statSet === s.id ? ' ◂' : ''}
          </Btn>
        ))}
        <span className="sr-only" role="status">{before ? 'Scores rolled. Undo roll is available.' : ''}</span>
        {c.statMethod === 'points' && <span className={total === POINT_BUY_TOTAL ? 'ok' : 'warn'}>Total {total} / {POINT_BUY_TOTAL}</span>}
      </div>
      <div className="grid">
        {STATS.map((s) => {
          const f = featureOf(s, c.stats[s]);
          return (
            <div key={s}>
              <Num label={`${s} — ${STAT_NAMES[s]}`} value={c.stats[s]} onChange={(v) => edit((d) => { d.stats[s] = v; })} />
              <span className="dim">Test {c.stats[s] * 5}%{f ? ` · ${f}` : ''}</span>
              {before && before[s] !== c.stats[s] && <span className="was"> · was {before[s]}</span>}
            </div>
          );
        })}
      </div>
      {c.statMethod === 'set' && <p className="dim mt-s">Reorder by editing scores; the set must keep the same values.</p>}
      <Rule />
      <h3>Derived attributes</h3>
      <DerivedTable c={c} />
    </>
  );
}
