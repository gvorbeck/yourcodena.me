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

/** The value at `path` inside `v`, or undefined. */
export const at = (v: unknown, path: string[]) => path.reduce<unknown>((o, k) => (o as Record<string, unknown> | null)?.[k], v);

/** For an array used as a set: what was added and removed, so a write can leave other writers' additions in place. */
export function setDelta(prev: unknown, next: unknown) {
  const a = Array.isArray(prev) ? prev : [], b = Array.isArray(next) ? next : [];
  return { add: b.filter((x) => !a.includes(x)), remove: a.filter((x) => !b.includes(x)) };
}

/** `obj` with the leaf at `path` set to `v` (or deleted for REMOVED); untouched branches are shared, not copied. */
function setPath(obj: unknown, path: string[], v: unknown): unknown {
  if (!path.length) return v;
  const [k, ...rest] = path, o = { ...(isObj(obj) ? obj : {}) };
  if (!rest.length && v === REMOVED) delete o[k];
  else o[k] = setPath(o[k], rest, v);
  return o;
}

/**
 * Three-way merge for a value someone else saved while this tab had it open: `local` plus every leaf that `remote`
 * changed from `base` (what this tab last read or wrote), except leaves `local` changed too, which stay local.
 * Arrays at `sets` (dotted paths) are sets: local keeps its own additions and removals and takes remote's too.
 */
export function mergeRemote<T>(base: T, local: T, remote: T, sets: string[] = []): T {
  const mine = diffPaths(base, local).map(([p]) => p);
  const overlaps = (p: string[]) => mine.some((m) => m.length <= p.length ? m.every((k, i) => k === p[i]) : p.every((k, i) => k === m[i]));
  const merged = diffPaths(base, remote).reduce<unknown>((out, [p, v]) => (overlaps(p) ? out : setPath(out, p, v)), local);
  return sets.reduce((out, s) => {
    const p = s.split('.'), { add, remove } = setDelta(at(base, p), at(remote, p)), own = at(local, p);
    if (!add.length && !remove.length) return out;
    const kept = Array.isArray(own) ? own.filter((x) => !remove.includes(x)) : [];
    return setPath(out, p, [...kept, ...add.filter((x) => !kept.includes(x))]);
  }, merged) as T;
}
