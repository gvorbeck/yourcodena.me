// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { useAutosave } from './useAutosave';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Props = { value: number; loaded?: number };
let save: Mock<(v: number) => Promise<void>>;
let report: Mock<(ok: boolean, e?: unknown) => void>;
let root: ReturnType<typeof createRoot>;
const Probe = ({ value, loaded }: Props) => { useAutosave(value, save, report, loaded); return null; };
const render = (p: Props) => act(() => root.render(createElement(Probe, p)));

beforeEach(() => {
  vi.useFakeTimers();
  save = vi.fn<(v: number) => Promise<void>>().mockResolvedValue(undefined);
  report = vi.fn<(ok: boolean, e?: unknown) => void>();
  root = createRoot(document.createElement('div'));
});
afterEach(() => { act(() => root.unmount()); vi.useRealTimers(); });

describe('useAutosave', () => {
  it('does not write the value it was given, only later changes, once they settle', () => {
    render({ value: 1 });
    vi.advanceTimersByTime(1000);
    expect(save).not.toHaveBeenCalled();
    render({ value: 2 });
    render({ value: 3 });
    vi.advanceTimersByTime(599);
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(3);
  });

  it('writes a pending change when the component unmounts', () => {
    render({ value: 1 });
    render({ value: 2 });
    act(() => root.unmount());
    expect(save).toHaveBeenCalledWith(2);
    root = createRoot(document.createElement('div')); // for afterEach
  });

  it('writes the first value when it differs from what is stored', () => {
    render({ value: 5, loaded: 4 });
    vi.advanceTimersByTime(600);
    expect(save).toHaveBeenCalledWith(5);
  });

  it('retries a rejected write on the next flush and reports each outcome', async () => {
    const denied = new Error('denied');
    save.mockRejectedValueOnce(denied);
    render({ value: 1 });
    render({ value: 2 });
    vi.advanceTimersByTime(600);
    await vi.advanceTimersByTimeAsync(0);
    expect(report.mock.calls).toEqual([[false, denied]]); // the error goes along, so the page can tell a deleted agent from a lost connection
    act(() => root.unmount()); // unmount flush retries the unsaved value
    expect(save).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(0);
    expect(report.mock.calls).toEqual([[false, denied], [true]]); // the retry going through clears the failure
    root = createRoot(document.createElement('div'));
  });
});
