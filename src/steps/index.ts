import type { StepId } from '../rules';

export const STEPS: { id: StepId | 'review'; title: string }[] = [
  { id: 'stats', title: 'Statistics & derived attributes' },
  { id: 'profession', title: 'Profession & skills' },
  { id: 'bonds', title: 'Bonds' },
  { id: 'details', title: 'Final details' },
  { id: 'review', title: 'Review & output' },
];

/** 1-based number shown in the sidebar. */
export const stepNo = (id: StepId | 'review') => STEPS.findIndex((s) => s.id === id) + 1;
