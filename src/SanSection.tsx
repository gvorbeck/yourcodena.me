import { useState } from 'react';
import { activeBonds, type Outcome } from './rules';
import { SAN_KINDS, SAN_KIND_LABEL, SAN_LOSS, loseSan, maxSanOf, setUnnatural, unnaturalOf, type Live, type SanKind } from './model/live';
import type { Character } from './model/character';
import * as play from './model/actions';
import { Btn, Counter } from './ui';
import { Hint } from './ui/bits';

/** Three boxes toward adapting to a kind of trauma (p. 74). */
const Pips = ({ label, n }: { label: string; n: number }) => (
  <div className="pips" role="img" aria-label={`Adaptation to ${label.toLowerCase()}: ${n} of 3`}>
    <span>{label}</span>{[0, 1, 2].map((i) => <i key={i} className={i < n ? 'on' : ''} />)}
  </div>
);

interface Props {
  c: Character; l: Live;
  set: <K extends keyof Live>(k: K, v: Live[K]) => void;
  setL: (u: Live | ((p: Live) => Live)) => void;
  act: (fn: (cur: Live) => play.Result) => void;
  say: (...m: string[]) => void;
  test: (label: string, base: number, wp?: number) => { ok: boolean; outcome: Outcome; roll: number; chance: number };
  onRollSan: () => void;
  /** Counts undos: one reverts the state a held loss was priced against. */
  undone: number;
}

/** The live sheet's Sanity section: SAN, Breaking Point, Unnatural, the SAN loss flow (with projecting onto a Bond), repressing, adaptation. */
export function SanSection({ c, l, set, setL, act, say, test, onRollSan, undone }: Props) {
  const [san, setSan] = useState({ kind: 'violence' as SanKind, loss: '0/1D4' });
  const [pending, setPending] = useState<play.PendingSan | null>(null);
  const [bondPick, setBondPick] = useState(0);
  const [seen, setSeen] = useState(undone);
  if (seen !== undone) { setSeen(undone); setPending(null); } // reset while rendering, so the typed loss stays
  const bonds = activeBonds(c);
  const bond = bonds.some((b) => b.i === bondPick) ? bondPick : bonds[0]?.i;

  const sanRoll = () => {
    const r = play.planSanLoss(l, san.kind, san.loss, () => test(SAN_LOSS, l.san));
    if ('error' in r) return say(r.error);
    setPending(r);
  };
  const applySan = () => {
    if (!pending) return;
    const r = loseSan(c, l, pending.amount, pending.kind);
    setL(r.live); setPending(null); say(`Lost ${pending.amount} SAN.`, ...r.notes);
  };
  const project = () => {
    if (!pending || bond === undefined) return;
    const r = play.project(c, l, pending, bond);
    setL(r.live); setPending(r.pending); say(...r.notes);
  };
  const repress = () => {
    if (bond !== undefined) act((cur) => play.repress(c, cur, bond, (wp) => test('SAN (repress)', cur.san, wp).ok));
  };

  return (
    <>
      <h3>Sanity</h3>
      <Counter label="SAN" value={l.san} max={maxSanOf(c, l)} onChange={(v) => set('san', v)} onRoll={onRollSan} />
      <Counter label="Breaking pt" value={l.bp} onChange={(v) => set('bp', v)} />
      <Counter label="Unnatural" note="Raises with exposure; maximum SAN is 99 minus it (p. 15)." value={unnaturalOf(c, l)} max={99} onChange={(v) => setL((p) => setUnnatural(c, p, v))} />
      {l.san <= l.bp && <p className="warn">SAN at or below breaking point.</p>}
      <div className="row noprint">
        <select aria-label="Trauma type" value={san.kind} onChange={(e) => setSan({ ...san, kind: e.target.value as SanKind })}>
          {SAN_KINDS.map((k) => <option key={k} value={k}>{SAN_KIND_LABEL[k]}</option>)}
        </select>
        <input className="san-loss" aria-label="SAN loss as success/failure, like 0/1D4" title="Success/failure loss as printed in the book (pp. 67–68). Add extra victims to the failure die, like 1D6+2 (the total never exceeds the die's maximum)." value={san.loss} onChange={(e) => setSan({ ...san, loss: e.target.value })} />
        <Btn onPress={sanRoll}>Roll SAN loss</Btn>
      </div>
      <Hint className="noprint">Loss is success/failure, like 0/1D4. Extra victims go on the failure die: 1D6+2, capped at 6. Tap “SAN” above for a plain SAN test.</Hint>
      <div className={pending ? 'alerts noprint' : 'noprint'}>
        <div role="status">{pending && <p>{pending.result} {pending.amount} SAN to lose ({pending.kind}).</p>}</div>
        {pending && (
          <div className="row even">
            <Btn onPress={applySan}>Apply</Btn>
            <Btn onPress={project} disabled={bond === undefined}>Project onto Bond (1D4 WP)</Btn>
            <Btn onPress={() => setPending(null)}>Cancel</Btn>
          </div>
        )}
      </div>
      <div className="row noprint">
        <label className="lbl" htmlFor="strain-bond">Bond to strain</label>
        <select id="strain-bond" value={bond ?? ''} onChange={(e) => setBondPick(Number(e.target.value))} disabled={bond === undefined}>
          {bonds.map((b) => <option key={b.i} value={b.i}>{b.name}</option>)}
        </select>
        <Btn onPress={repress} disabled={bond === undefined}>Repress insanity (1D4 WP)</Btn>
      </div>
      <Pips label="Violence" n={l.adapt.v} />
      <Pips label="Helplessness" n={l.adapt.h} />
    </>
  );
}
