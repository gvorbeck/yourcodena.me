import { describe, expect, it } from 'vitest';
import { overBudget } from './budget.js';

describe('overBudget', () => {
  it('ignores the 50% and 90% alerts', () => {
    expect(overBudget({ costAmount: 2.5, budgetAmount: 5 })).toBe(false);
    expect(overBudget({ costAmount: 4.5, budgetAmount: 5 })).toBe(false);
  });
  it('fires at and past the budget', () => {
    expect(overBudget({ costAmount: 5, budgetAmount: 5 })).toBe(true);
    expect(overBudget({ costAmount: 12.34, budgetAmount: 5 })).toBe(true);
  });
  it('never fires on a malformed or empty message', () => {
    expect(overBudget(undefined)).toBe(false);
    expect(overBudget({})).toBe(false);
    expect(overBudget({ costAmount: 'lots', budgetAmount: 5 })).toBe(false);
    expect(overBudget({ costAmount: 10, budgetAmount: 0 })).toBe(false);
  });
});
