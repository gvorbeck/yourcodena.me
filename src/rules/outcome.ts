// Kept apart from rules/index.ts so the game page can colour its roll log without loading the whole rules module.
export const isSuccess = (o: string) => o === 'success' || o === 'critical success';
/** Colour class for a result, with `strong` (underline) on the two extremes so they don't rely on colour alone. */
export const outcomeClass = (o: string) => (isSuccess(o) ? 'ok' : 'warn') + (o === 'critical success' || o === 'fumble' ? ' strong' : '');
/** "Firearms 45% (−20)": a test as the roll log, the live sheet and Discord show it. */
export const testText = (label: string, chance: number, pen: number) => `${label} ${chance}%${pen ? ` (−${pen})` : ''}`;
/** A d% result as printed: 07, 100. */
export const d100Text = (roll: number) => String(roll).padStart(2, '0');
