// Kept apart from rules/index.ts so the game page can colour its roll log without loading the whole rules module.
export const isSuccess = (o: string) => o === 'success' || o === 'critical success';
/** Colour class for a result, with `strong` (underline) on the two extremes so they don't rely on colour alone. */
export const outcomeClass = (o: string) => (isSuccess(o) ? 'ok' : 'warn') + (o === 'critical success' || o === 'fumble' ? ' strong' : '');
/** "Firearms 45% (−20)": a test as the roll log, the live sheet and Discord show it. */
export const testText = (label: string, chance: number, pen: number) => `${label} ${chance}%${pen ? ` (−${pen})` : ''}`;
/** A d% result as printed: 07, 100. */
export const d100Text = (roll: number) => String(roll).padStart(2, '0');

// ---- Roll-log entries. Tests have no `kind`; the Discord bot also logs plain dice and HP lost.
export type RollKind = 'dice' | 'loss' | 'damage';
interface EntryBase { agentName: string; label: string; roll: number; chance: number; penalty: number; outcome: string }
/** A d% test: `chance` is after the penalty. */
export type TestEntry = EntryBase & { kind?: undefined };
/**
 * Plain dice: `label` is the dice ("2D6+1"), `roll` the total. chance 0, penalty 0 and outcome '' are placeholders so
 * game pages opened before these entries existed still render them instead of crashing.
 */
export type DiceEntry = EntryBase & { kind: 'dice'; dice: number[]; mod: number };
export type LossStat = 'HP' | 'SAN';
/**
 * HP or SAN lost through /dg damage or /dg san: `label` is what was rolled ("1D10", "0/1D6"), `roll` the amount lost,
 * `from`/`to` the stat before and after, `notes` what the rules say happened (stunned, temporary insanity…), and
 * `cause` the kind of SAN loss (violence, helplessness, unnatural).
 */
export type LossEntry = EntryBase & {
  kind: 'loss'; stat: LossStat; dice: number[]; mod: number; from: number; to: number; notes: string[]; cause?: string;
  /** HP losses only: the old damage fields, so game pages opened before loss entries existed still show them right. */
  hpFrom?: number; hpTo?: number;
};
/** HP lost, as /dg damage logged it before LossEntry (Oct 2026). Still in some roll logs, so still read. */
export type DamageEntry = EntryBase & { kind: 'damage'; dice: number[]; mod: number; hpFrom: number; hpTo: number };
export type RollEntry = TestEntry | DiceEntry | LossEntry | DamageEntry;
/** Any loss entry in the current shape, so readers handle one kind. */
export const asLoss = (r: LossEntry | DamageEntry): LossEntry =>
  r.kind === 'loss' ? r : { ...r, kind: 'loss', stat: 'HP', from: r.hpFrom, to: r.hpTo, notes: [hurtNote(r.hpFrom, r.hpTo)].filter(Boolean) };
/** A modifier as written after dice: "+1", "-2", or nothing. */
export const modText = (mod: number) => (mod > 0 ? `+${mod}` : mod < 0 ? `${mod}` : '');
/** "(4+4+1)" when the total came from more than one number; '' for a single die or a flat number. */
export const diceDetail = (dice: number[], mod: number) => (dice.length > 1 || (dice.length && mod) ? `(${dice.join('+')}${modText(mod)})` : '');
/** "2D6+1 (4+4+1)": the dice and how the total was made, as the roll log and Discord show them. */
export const diceLabel = (label: string, dice: number[], mod: number) => `${label} ${diceDetail(dice, mod)}`.trim();
/** p. 55: what a hit taking an Agent from `from` to `to` HP means. '' when nothing special happens. */
export function hurtNote(from: number, to: number): string {
  if (to === 0) return 'Dead (p. 55)';
  const notes = [(from - to) * 2 >= from && 'Stunned', to <= 2 && 'Unconscious, CON×5 test for permanent injury'].filter(Boolean);
  return notes.length ? `${notes.join(' · ')} (p. 55)` : '';
}
