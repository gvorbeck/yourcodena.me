// Kept apart from rules/index.ts so the game page can colour its roll log without loading the whole rules module.
export const isSuccess = (o: string) => o === 'success' || o === 'critical success';
/** Colour class for a result, with `strong` (underline) on the two extremes so they don't rely on colour alone. */
export const outcomeClass = (o: string) => (isSuccess(o) ? 'ok' : 'warn') + (o === 'critical success' || o === 'fumble' ? ' strong' : '');
