import { useEffect, useRef, useState } from 'react';
import { loadCharacter, importJson, newCharacter, saveCharacter, type Character } from './model/character';
import { validate } from './rules';
import { Btn, Win, type Up } from './ui';
import { StatsStep } from './steps/StatsStep';
import { ProfessionStep } from './steps/ProfessionStep';
import { BondsStep } from './steps/BondsStep';
import { DetailsStep } from './steps/DetailsStep';
import { ReviewStep } from './steps/ReviewStep';
import { STEPS } from './steps';

export function App() {
  const [c, setC] = useState<Character>(loadCharacter);
  const [step, setStep] = useState(() => {
    try { return Math.min(STEPS.length - 1, Math.max(0, Number(localStorage.getItem('dg.step')) || 0)); } catch { return 0; }
  });
  useEffect(() => { try { localStorage.setItem('dg.step', String(step)); } catch { /* storage blocked */ } }, [step]);
  useEffect(() => saveCharacter(c), [c]);
  const file = useRef<HTMLInputElement>(null);
  const newAgent = () => { if (confirm('Discard the current Agent?')) { setC(newCharacter()); setStep(0); } };
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      // Alt+key, never a bare letter, so typing and speech input can't trigger it (WCAG 2.1.4).
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      // Option+N/I are dead keys on macOS (ñ, î), so leave text fields alone.
      if (e.target instanceof Element && e.target.matches('input, textarea, select, [contenteditable]')) return;
      if (e.code === 'KeyN') { e.preventDefault(); newAgent(); }
      else if (e.code === 'KeyI') { e.preventDefault(); file.current?.click(); }
    };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, []);

  const up: Up = (fn) => setC((prev) => { const d = structuredClone(prev); fn(d); return d; });
  const issues = validate(c);
  const cur = STEPS[step];
  const props = { c, up };

  return (
    <>
      <nav className="menubar" aria-label="Application">
        <span>YOURCODENA.ME</span>
        <span className="dim">// Agent intake terminal</span>
        <span className="grow">
          <button onClick={() => file.current?.click()}>[Alt+I] Import agent</button>
          <button onClick={newAgent}>[Alt+N] New agent</button>
          <input ref={file} type="file" accept=".json,application/json" hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try { setC(await importJson(f)); setStep(0); } catch { alert('Not a valid Agent file.'); }
            }} />
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
                    <span className="n">{i + 1}.</span><span>{s.title}</span>
                    <span className={`flag ${bad ? 'warn' : 'ok'}`}>{s.id === 'review' ? '' : bad ? '!' : '✓'}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </Win>

        <Win title={`STEP ${step + 1} // ${cur.title.toUpperCase()}`} right={`${step + 1}/${STEPS.length}`}>
          {cur.id === 'stats' && <StatsStep {...props} />}
          {cur.id === 'profession' && <ProfessionStep {...props} />}
          {cur.id === 'bonds' && <BondsStep {...props} />}
          {cur.id === 'details' && <DetailsStep {...props} />}
          {cur.id === 'review' && <ReviewStep {...props} />}
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
        <small className="legal dim">Published by arrangement with the Delta Green Partnership. The intellectual property known as Delta Green is a trademark and copyright owned by the Delta Green Partnership, who has licensed its use here. The contents of this document are ©<a href="https://iamgarrett.com">J. Garrett Vorbeck</a>, excepting those elements that are components of the Delta Green intellectual property.</small>
      </footer>
    </>
  );
}
