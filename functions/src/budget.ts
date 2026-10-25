/** The fields we read from a Cloud Billing budget notification. Google sends one every ~30 minutes per budget. */
export interface BudgetAlert { costAmount?: unknown; budgetAmount?: unknown }

/** True once this month's actual cost has reached the budget. 50% and 90% alerts, and malformed messages, never shut anything off. */
export function overBudget(a: BudgetAlert | undefined): boolean {
  const cost = Number(a?.costAmount), budget = Number(a?.budgetAmount);
  return Number.isFinite(cost) && Number.isFinite(budget) && budget > 0 && cost >= budget;
}
