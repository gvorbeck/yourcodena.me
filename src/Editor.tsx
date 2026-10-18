import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { Link } from 'react-router-dom';
import { importJson, type Character } from './model/character';
import { blocking, type validate } from './rules';
import { Btn, ConfirmDialog, Win, type Up } from './ui';
import { MenuBar } from './ui/MenuBar';
import { Legal } from './ui/Legal';
import { StatsStep } from './steps/StatsStep';
import { ProfessionStep } from './steps/ProfessionStep';
import { BondsStep } from './steps/BondsStep';
import { DetailsStep } from './steps/DetailsStep';
import { ReviewStep } from './steps/ReviewStep';
import { STEPS } from './steps';

interface EditorProps { agentId: string; c: Character; issues: ReturnType<typeof validate>; setC: Dispatch<SetStateAction<Character>>; gameId: string; failed: boolean; onLive: () => void }

export function Editor({ agentId, c, issues, setC, gameId, failed, onLive }: EditorProps) {
  // Remembered per agent, so a new agent starts at step 1 and a reload returns to where you were.
  const stepKey = `dg.step.${agentId}`;
  const [step, setStep] = useState(() => {
    try { return Math.min(STEPS.length - 1, Math.max(0, Number(localStorage.getItem(stepKey)) || 0)); } catch { return 0; }
  });
  useEffect(() => { try { localStorage.setItem(stepKey, String(step)); } catch { /* storage blocked */ } }, [step, stepKey]);
  // Return to the top on step change. Comparing with the previous step (not a mounted flag) survives StrictMode's double effect run.
  const prevStep = useRef(step);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (prevStep.current !== step) { scrollTo(0, 0); heading.current?.focus(); } prevStep.current = step; }, [step]);
  useEffect(() => { document.title = `${c.details.name.trim() || 'Unnamed agent'} // YOURCODENA.ME`; }, [c.details.name]);
  const file = useRef<HTMLInputElement>(null);
  const [askImport, setAskImport] = useState(false);
  const [importError, setImportError] = useState(false);
  const pickFile = () => setAskImport(true);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      // Alt+key, never a bare letter, so typing and speech input can't trigger it (WCAG 2.1.4).
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      // Option+I is a dead key on macOS (î), so leave text fields alone.
      if (e.target instanceof Element && e.target.matches('input, textarea, select, [contenteditable]')) return;
      if (e.code === 'KeyI') { e.preventDefault(); pickFile(); }
    };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, []);

  const up: Up = (fn) => setC((prev) => { const d = structuredClone(prev); fn(d); return d; });
  const cur = STEPS[step];
  const open = blocking(issues).length;
  const here = issues.filter((x) => x.step === cur.id);
  const props = { c, up };

  return (
    <>
      <MenuBar subtitle="// Agent intake terminal">
        <Link to={`/g/${gameId}`}>&lt; Game {gameId}</Link>
        <button onClick={pickFile}>[Alt+I] Import agent</button>
        <input ref={file} type="file" accept=".json,application/json" hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try { setC(await importJson(f)); setStep(0); setImportError(false); } catch { setImportError(true); }
          }} />
      </MenuBar>

      <main id="main" tabIndex={-1}>
      <h1 className="sr-only">Agent intake: {c.details.name.trim() || 'unnamed agent'}</h1>
      <div role="alert" className="noprint">{importError && <p className="warn page">Not a valid Agent file.</p>}</div>
      <ConfirmDialog open={askImport} title="Import an agent" confirm="Import" onClose={() => setAskImport(false)} onConfirm={() => file.current?.click()}>
        Importing a file replaces this Agent. Continue?
      </ConfirmDialog>
      <div className="shell">
        <Win title="CREATION STEPS">
          <ol className="steps" role="list">
            {STEPS.map((s, i) => {
              const bad = s.id !== 'review' && blocking(issues).some((x) => x.step === s.id);
              return (
                <li key={s.id}>
                  <button aria-current={i === step ? 'step' : undefined} onClick={() => setStep(i)}>
                    <span className="n">{i + 1}.</span><span>{s.title}</span>
                    <span className={`flag ${bad ? 'warn' : 'ok'}`}>{s.id === 'review' ? '' : bad ? '!' : '✓'}{s.id !== 'review' && <span className="sr-only">{bad ? ' has open items' : ' complete'}</span>}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </Win>

        <Win title={`STEP ${step + 1} // ${cur.title.toUpperCase()}`} right={`${step + 1}/${STEPS.length}`} headingRef={heading}>
          {cur.id === 'stats' && <StatsStep {...props} />}
          {cur.id === 'profession' && <ProfessionStep {...props} />}
          {cur.id === 'bonds' && <BondsStep {...props} />}
          {cur.id === 'details' && <DetailsStep {...props} />}
          {cur.id === 'review' && <ReviewStep {...props} onLive={onLive} />}
          {cur.id !== 'review' && here.length > 0 && <ul className="issues noprint">{here.map((x, n) => <li key={n}>{x.msg}</li>)}</ul>}
          <div className="row noprint mt-l">
            <Btn disabled={step === 0} onPress={() => setStep(step - 1)}>&lt; Back</Btn>
            <Btn disabled={step === STEPS.length - 1} onPress={() => setStep(step + 1)}>Next ▸</Btn>
          </div>
        </Win>
      </div>
      </main>

      <footer className="statusbar noprint">
        <span>Agent: {c.details.name || 'UNNAMED'}</span>
        <span className={open ? 'warn' : 'ok'}>{open ? `${open} open item${open === 1 ? '' : 's'}` : 'All steps complete'}</span>
        {failed ? <span className="warn" role="alert">Not saved: check your connection and reload</span> : <span className="dim">Autosaved to game {gameId} · Source: Agent's Handbook</span>}
        <span className="cursor" aria-hidden />
        <Legal />
      </footer>
    </>
  );
}
