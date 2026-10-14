import { useEffect, useState } from 'react';
import { loadCharacter, newCharacter, saveCharacter, type Character } from './model/character';
import { validate, type StepId } from './rules';
import { Btn, Win, type Up } from './ui';
import { StatsStep } from './steps/StatsStep';
import { DerivedStep } from './steps/DerivedStep';
import { ProfessionStep } from './steps/ProfessionStep';
import { BondsStep } from './steps/BondsStep';
import { DetailsStep } from './steps/DetailsStep';
import { ReviewStep } from './steps/ReviewStep';

const STEPS: { id: StepId | 'review'; roman: string; title: string }[] = [
  { id: 'stats', roman: 'I', title: 'Statistics' },
  { id: 'derived', roman: 'II', title: 'Derived attributes' },
  { id: 'profession', roman: 'III', title: 'Profession & skills' },
  { id: 'bonds', roman: 'IV', title: 'Bonds' },
  { id: 'details', roman: 'V', title: 'Final details' },
  { id: 'review', roman: 'VI', title: 'Review & output' },
];

export function App() {
  const [c, setC] = useState<Character>(loadCharacter);
  const [step, setStep] = useState(0);
  useEffect(() => saveCharacter(c), [c]);

  const up: Up = (fn) => setC((prev) => { const d = structuredClone(prev); fn(d); return d; });
  const issues = validate(c);
  const cur = STEPS[step];
  const props = { c, up };

  return (
    <>
      <nav className="menubar" aria-label="Application">
        <span>YOURCODENA.ME v0.1</span>
        <span className="dim">// Agent intake terminal</span>
        <span className="grow">
          <button onClick={() => { if (confirm('Discard the current Agent?')) { setC(newCharacter()); setStep(0); } }}>[N] New agent</button>
        </span>
      </nav>

      <div className="shell">
        <Win title="CREATION STEPS">
          <ol className="steps" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {STEPS.map((s, i) => {
              const bad = s.id !== 'review' && issues.some((x) => x.step === s.id);
              return (
                <li key={s.id}>
                  <button aria-current={i === step ? 'step' : undefined} onClick={() => setStep(i)}>
                    <span className="n">{s.roman}.</span><span>{s.title}</span>
                    <span className={`flag ${bad ? 'warn' : 'ok'}`}>{s.id === 'review' ? '' : bad ? '!' : '✓'}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </Win>

        <Win title={`STEP ${cur.roman} // ${cur.title.toUpperCase()}`} right={`${step + 1}/${STEPS.length}`}>
          {cur.id === 'stats' && <StatsStep {...props} />}
          {cur.id === 'derived' && <DerivedStep {...props} />}
          {cur.id === 'profession' && <ProfessionStep {...props} />}
          {cur.id === 'bonds' && <BondsStep {...props} />}
          {cur.id === 'details' && <DetailsStep {...props} />}
          {cur.id === 'review' && <ReviewStep {...props} replace={setC} />}
          <div className="row noprint" style={{ marginTop: '1.5rem' }}>
            <Btn disabled={step === 0} onPress={() => setStep(step - 1)}>◂ Back</Btn>
            <Btn disabled={step === STEPS.length - 1} onPress={() => setStep(step + 1)}>Next ▸</Btn>
          </div>
        </Win>
      </div>

      <footer className="statusbar noprint">
        <span>Agent: {c.details.name || 'UNNAMED'}</span>
        <span className={issues.length ? 'warn' : 'ok'}>{issues.length ? `${issues.length} open item${issues.length === 1 ? '' : 's'}` : 'All steps complete'}</span>
        <span className="dim">Autosaved locally · Source: Agent's Handbook</span>
        <span className="cursor" aria-hidden />
        <small className="legal dim">Unofficial fan tool, not affiliated with or endorsed by the Delta Green Partnership or Arc Dream Publishing. Delta Green is a trademark and copyright of the Delta Green Partnership.</small>
      </footer>
    </>
  );
}
