// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { useAutosave } from './useAutosave';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Props = { value: number; loaded?: number };
let save: Mock<(v: number) => Promise<void>>;
let onError: Mock<() => void>;
let root: ReturnType<typeof createRoot>;
const Probe = ({ value, loaded }: Props) => { useAutosave(value, save, onError, loaded); return null; };
const render = (p: Props) => act(() => root.render(createElement(Probe, p)));

beforeEach(() => {
  vi.useFakeTimers();
  save = vi.fn<(v: number) => Promise<void>>().mockResolvedValue(undefined);
  onError = vi.fn<() => void>();
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

  it('retries a rejected write on the next flush and reports the error', async () => {
    save.mockRejectedValueOnce(new Error('denied'));
    render({ value: 1 });
    render({ value: 2 });
    vi.advanceTimersByTime(600);
    await vi.advanceTimersByTimeAsync(0);
    expect(onError).toHaveBeenCalledTimes(1);
    act(() => root.unmount()); // unmount flush retries the unsaved value
    expect(save).toHaveBeenCalledTimes(2);
    root = createRoot(document.createElement('div'));
  });
});
