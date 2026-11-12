import { useId, useState } from 'react';
import { rollExpression } from './rules';
import { diceLabel } from './rules/outcome';
import { randomInt } from './rules/data/random';
import { Btn } from './ui';

/** Plain dice like /dg roll test:2D6+1 (damage you deal, anything outward). */
// shortcut: the result is shown here only, not in the game's roll log, because the rules only accept d% tests from browsers; log it once they allow dice entries.
export function DiceRoller() {
  const id = useId();
  const [expr, setExpr] = useState('1D6');
  const [out, setOut] = useState('');
  const [n, setN] = useState(0);
  const roll = () => {
    const r = rollExpression(expr, (s) => 1 + randomInt(s));
    setN(n + 1); // numbers every outcome, errors too, so identical text still changes and gets announced
    setOut(`#${n + 1} ${r?.dice.length ? `${diceLabel(r.expr, r.dice, r.mod)} → ${r.total}` : 'Write dice like 2D6+1.'}`);
  };
  return (
    <form className="row noprint" onSubmit={(e) => { e.preventDefault(); roll(); }}>
      <label className="lbl" htmlFor={id}>Dice</label>
      <input id={id} className="short-input" autoComplete="off" spellCheck={false} value={expr} onChange={(e) => setExpr(e.target.value)} />
      <Btn onPress={roll}>Roll</Btn>
      <output>{out}</output>
    </form>
  );
}
