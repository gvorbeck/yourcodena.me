// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isStaleChunk, reloadForNewBuild } from './staleBuild';

describe('stale build recovery', () => {
  beforeEach(() => sessionStorage.clear());

  it('recognises a failed dynamic import in each browser', () => {
    for (const m of ['Failed to fetch dynamically imported module: https://x/assets/a.js', 'error loading dynamically imported module', 'Importing a module script failed.'])
      expect(isStaleChunk(new TypeError(m))).toBe(true);
    expect(isStaleChunk(new Error('permission-denied'))).toBe(false);
    expect(isStaleChunk('dynamically imported module')).toBe(false);
  });

  it('reloads once, then refuses again within ten seconds', () => {
    const reload = vi.fn();
    expect(reloadForNewBuild(reload, 1_000_000)).toBe(true);
    expect(reloadForNewBuild(reload, 1_005_000)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(reloadForNewBuild(reload, 1_011_000)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });
});
