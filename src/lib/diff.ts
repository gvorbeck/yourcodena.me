/** Marks a key that exists in the old value but not the new one. */
export const REMOVED = Symbol('removed');
export type Change = [path: string[], value: unknown];

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/**
 * The smallest set of leaf writes that turns `prev` into `next`. Plain objects are walked key by key; arrays and
 * primitives are compared whole. Saving only these keeps two devices editing different fields of one agent from
 * overwriting each other.
 */
export function diffPaths(prev: unknown, next: unknown, path: string[] = []): Change[] {
  if (isObj(prev) && isObj(next)) {
    return [...new Set([...Object.keys(prev), ...Object.keys(next)])].flatMap((k) =>
      next[k] === undefined ? [[[...path, k], REMOVED] as Change] : diffPaths(prev[k], next[k], [...path, k]));
  }
  return JSON.stringify(prev) === JSON.stringify(next) ? [] : [[path, next]];
}

/** For an array used as a set: what was added and removed, so a write can leave other writers' additions in place. */
export function setDelta(prev: unknown, next: unknown) {
  const a = Array.isArray(prev) ? prev : [], b = Array.isArray(next) ? next : [];
  return { add: b.filter((x) => !a.includes(x)), remove: a.filter((x) => !b.includes(x)) };
}
