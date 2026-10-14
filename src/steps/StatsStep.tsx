import { STATS, STAT_NAMES, STAT_SETS, POINT_BUY_TOTAL } from '../rules/data/creation';
import { featureOf, roll4d6dl } from '../rules';
import { DerivedStep } from './DerivedStep';
import { Btn, Choice, Num, Rule, RadioGroup, Label, type StepProps } from '../ui';

export function StatsStep({ c, up }: StepProps) {
  const total = STATS.reduce((a, s) => a + c.stats[s], 0);
  return (
    <>
      <p className="dim">Handbook p. 14 — roll 4D6 and drop the lowest six times, divide 72 points, or use an assignable set. Test = stat × 5.</p>
      <Rule />
      <RadioGroup value={c.statMethod} onChange={(v) => up((d) => { d.statMethod = v as typeof c.statMethod; })}>
        <Label className="lbl">Method</Label>
        <Choice value="roll">Roll 4D6, drop lowest</Choice>
        <Choice value="points">Divide {POINT_BUY_TOTAL} points</Choice>
        <Choice value="set">Assignable set</Choice>
      </RadioGroup>
      <div className="row" style={{ margin: '.75rem 0' }}>
        {c.statMethod === 'roll' && (
          <Btn onPress={() => up((d) => { STATS.forEach((s) => { d.stats[s] = roll4d6dl(); }); })}>Roll six scores</Btn>
        )}
        {c.statMethod === 'set' && STAT_SETS.map((s) => (
          <Btn key={s.id} onPress={() => up((d) => { d.statSet = s.id; STATS.forEach((st, i) => { d.stats[st] = s.values[i]; }); })}>
            {s.name} ({s.values.join('/')}){c.statSet === s.id ? ' ◂' : ''}
          </Btn>
        ))}
        {c.statMethod === 'points' && <span className={total === POINT_BUY_TOTAL ? 'ok' : 'warn'}>Total {total} / {POINT_BUY_TOTAL}</span>}
      </div>
      <div className="grid">
        {STATS.map((s) => {
          const f = featureOf(s, c.stats[s]);
          return (
            <div key={s}>
              <Num label={`${s} — ${STAT_NAMES[s]}`} value={c.stats[s]} onChange={(v) => up((d) => { d.stats[s] = v; })} />
              <span className="dim">Test {c.stats[s] * 5}%{f ? ` · ${f}` : ''}</span>
            </div>
          );
        })}
      </div>
      {c.statMethod === 'set' && <p className="dim" style={{ marginTop: '.5rem' }}>Reorder by editing scores; the set must keep the same values.</p>}
      <Rule />
      <h3>Derived attributes</h3>
      <DerivedStep c={c} up={up} />
    </>
  );
}
