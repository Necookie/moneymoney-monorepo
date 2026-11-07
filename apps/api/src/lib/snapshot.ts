import {
  accounts,
  budgets,
  categories,
  type Database,
  goalAllocations,
  goals,
  occurrenceOverrides,
  scheduledEvents,
  transactions,
} from '@mm/database';
import {
  accountBalances,
  cashFlow,
  endOfMonth,
  monthKey,
  spendingByCategory,
  startOfMonth,
  summarizePosition,
  todayInTimeZone,
  type BudgetInput,
  type EngineAccount,
  type EngineTransaction,
  type ForecastInput,
} from '@mm/finance-engine';
import type { ForecastMode } from '@mm/types';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { getSettings } from '../modules/settings/repository.js';
import { toEngineEvent, toEngineOverride } from './mappers.js';

/**
 * Everything the finance engine needs for one user, loaded in a handful of queries.
 * Personal-finance volumes (thousands of rows) comfortably fit in memory; see
 * docs/architecture for the scaling note.
 */
export async function loadSnapshot(db: Database, userId: string, now: Date = new Date()) {
  const settings = await getSettings(db, userId);
  const today = todayInTimeZone(settings.timezone, now);

  const [
    accountRows,
    txRows,
    eventRows,
    overrideRows,
    budgetRows,
    goalRows,
    allocationSums,
    categoryRows,
  ] = await Promise.all([
    db.select().from(accounts).where(eq(accounts.userId, userId)),
    db
      .select({
        id: transactions.id,
        type: transactions.type,
        amount: transactions.amount,
        accountId: transactions.accountId,
        counterAccountId: transactions.counterAccountId,
        categoryId: transactions.categoryId,
        occurredOn: transactions.occurredOn,
      })
      .from(transactions)
      .where(and(eq(transactions.userId, userId), isNull(transactions.deletedAt))),
    db.select().from(scheduledEvents).where(eq(scheduledEvents.userId, userId)),
    db.select().from(occurrenceOverrides).where(eq(occurrenceOverrides.userId, userId)),
    db.select().from(budgets).where(eq(budgets.userId, userId)),
    db.select().from(goals).where(eq(goals.userId, userId)),
    db
      .select({
        goalId: goalAllocations.goalId,
        total: sql<string>`coalesce(sum(${goalAllocations.amount}), 0)`,
      })
      .from(goalAllocations)
      .where(eq(goalAllocations.userId, userId))
      .groupBy(goalAllocations.goalId),
    db.select().from(categories).where(eq(categories.userId, userId)),
  ]);

  const engineAccounts: EngineAccount[] = accountRows.map((a) => ({
    id: a.id,
    type: a.type,
    openingBalance: a.openingBalance,
    openingDate: a.openingDate,
  }));
  const engineTxs: EngineTransaction[] = txRows;
  const balances = accountBalances(engineAccounts, engineTxs, today);
  const position = summarizePosition(engineAccounts, balances);

  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);
  const month = {
    key: monthKey(today),
    start: monthStart,
    end: monthEnd,
    ...cashFlow(engineTxs, monthStart, today),
  };
  const spendByCategory = spendingByCategory(engineTxs, monthStart, monthEnd);

  const goalCurrent = new Map(allocationSums.map((r) => [r.goalId, Number(r.total)]));
  const events = eventRows.map(toEngineEvent);
  const overrides = overrideRows.map(toEngineOverride);

  const budgetInputs: BudgetInput[] = budgetRows.map((b) => ({
    id: b.id,
    categoryId: b.categoryId,
    limit: b.amount,
    spentThisMonth:
      b.categoryId === null ? month.netSpending : (spendByCategory.get(b.categoryId) ?? 0),
  }));

  const emergencyGoal =
    goalRows.find((g) => g.id === settings.emergencyFundGoalId) ??
    goalRows.find((g) => g.kind === 'emergency' && g.archivedAt === null);
  const emergencyFundReserved = emergencyGoal
    ? Math.max(0, goalCurrent.get(emergencyGoal.id) ?? 0)
    : 0;

  function forecastInput(
    horizonDays: number,
    mode: ForecastMode = 'expected',
    includeBudgetedSpending = true,
  ): ForecastInput {
    return {
      asOf: today,
      horizonDays,
      startingBalance: position.net,
      events,
      overrides,
      budgets: budgetInputs,
      mode,
      safetyBuffer: settings.safetyBuffer,
      includeBudgetedSpending,
    };
  }

  return {
    settings,
    today,
    accountRows,
    categoryRows,
    engineAccounts,
    engineTxs,
    balances,
    position,
    month,
    spendByCategory,
    eventRows,
    events,
    overrides,
    budgetRows,
    budgetInputs,
    goalRows,
    goalCurrent,
    emergencyFundReserved,
    forecastInput,
  };
}

export type Snapshot = Awaited<ReturnType<typeof loadSnapshot>>;
