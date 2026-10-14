import { SAMPLE_BONDS } from '../rules/data/creation';
import { bondCount, derived, professionOf } from '../rules';
import { Rule, Text, type StepProps } from '../ui';

export function BondsStep({ c, up }: StepProps) {
  const need = bondCount(c);
  const score = derived(c).bondScore;
  const set = (i: number, k: 'name' | 'note', v: string) =>
    up((d) => {
      while (d.bonds.length <= i) d.bonds.push({ name: '', note: '' });
      d.bonds[i][k] = v;
    });
  return (
    <>
      <p className="dim">Handbook p. 36 — real people or groups. Each Bond starts at your CHA ({score}) and can never exceed it.</p>
      <Rule />
      {!professionOf(c) && <p className="warn">Choose a profession in step II first.</p>}
      <div className="grid">
        {Array.from({ length: need }, (_, i) => (
          <div key={i}>
            <Text label={`Bond ${i + 1} — score ${score}`} value={c.bonds[i]?.name ?? ''} onChange={(v) => set(i, 'name', v)} />
            <Text label="Note" value={c.bonds[i]?.note ?? ''} onChange={(v) => set(i, 'note', v)} />
          </div>
        ))}
      </div>
      <p className="dim" style={{ marginTop: '.75rem' }}>Ideas: {SAMPLE_BONDS.join(' · ')}</p>
    </>
  );
}
