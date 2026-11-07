import {
  accounts,
  budgets,
  categories,
  type Database,
  goalAllocations,
  goals,
  scheduledEvents,
  transactions,
  userSettings,
} from '@mm/database';
import {
  addDays,
  addMonthsClamped,
  endOfMonth,
  startOfMonth,
  todayInTimeZone,
} from '@mm/finance-engine';
import { and, eq, inArray } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { conflict } from '../../lib/errors.js';
import { getSettings } from '../settings/repository.js';

const peso = (n: number) => Math.round(n * 100);

/**
 * Demo mode: clearly flagged sample data (is_demo = true) so the app can be explored before real
 * data exists. Never mixed silently with real records — the UI shows a "Demo data" banner while
 * settings.demo_mode is on, and everything can be removed in one call.
 */
async function seedDemo(db: Database, userId: string) {
  const settings = await getSettings(db, userId);
  const today = todayInTimeZone(settings.timezone);
  const catRows = await db.select().from(categories).where(eq(categories.userId, userId));
  const cat = (name: string) => catRows.find((c) => c.name === name)?.id ?? null;
  const opening = addDays(startOfMonth(today), -62);

  await db.transaction(async (tx) => {
    const acc = {
      cash: randomUUID(),
      bank: randomUUID(),
      gcash: randomUUID(),
      savings: randomUUID(),
      card: randomUUID(),
    };
    await tx.insert(accounts).values([
      {
        id: acc.cash,
        userId,
        name: 'Cash wallet',
        type: 'cash',
        openingBalance: peso(3_500),
        openingDate: opening,
        isDemo: true,
      },
      {
        id: acc.bank,
        userId,
        name: 'Payroll bank',
        type: 'bank',
        openingBalance: peso(42_000),
        openingDate: opening,
        isDemo: true,
      },
      {
        id: acc.gcash,
        userId,
        name: 'E-wallet',
        type: 'ewallet',
        openingBalance: peso(2_800),
        openingDate: opening,
        isDemo: true,
      },
      {
        id: acc.savings,
        userId,
        name: 'High-yield savings',
        type: 'savings',
        openingBalance: peso(60_000),
        openingDate: opening,
        isDemo: true,
      },
      {
        id: acc.card,
        userId,
        name: 'Credit card',
        type: 'credit',
        openingBalance: -peso(4_200),
        openingDate: opening,
        isDemo: true,
      },
    ]);

    // Two months of history plus this month to date.
    const txs: Array<typeof transactions.$inferInsert> = [];
    const add = (t: Omit<typeof transactions.$inferInsert, 'id' | 'userId' | 'isDemo'>) => {
      if (t.occurredOn > today) return;
      txs.push({ ...t, id: randomUUID(), userId, isDemo: true });
    };
    for (let m = -2; m <= 0; m++) {
      const monthStart = addMonthsClamped(startOfMonth(today), m, 1);
      const day = (d: number) => addDays(monthStart, d - 1);
      add({
        type: 'income',
        amount: peso(32_500),
        accountId: acc.bank,
        categoryId: cat('Salary'),
        occurredOn: day(15),
        description: 'Salary — 15th',
      });
      add({
        type: 'income',
        amount: peso(32_500),
        accountId: acc.bank,
        categoryId: cat('Salary'),
        occurredOn: endOfMonth(monthStart),
        description: 'Salary — month end',
      });
      add({
        type: 'expense',
        amount: peso(18_000),
        accountId: acc.bank,
        categoryId: cat('Housing'),
        occurredOn: day(5),
        description: 'Rent',
      });
      add({
        type: 'expense',
        amount: peso(2_650),
        accountId: acc.bank,
        categoryId: cat('Bills & Utilities'),
        occurredOn: day(12),
        description: 'Electricity',
      });
      add({
        type: 'expense',
        amount: peso(1_699),
        accountId: acc.bank,
        categoryId: cat('Bills & Utilities'),
        occurredOn: day(18),
        description: 'Fiber internet',
      });
      add({
        type: 'transfer',
        amount: peso(5_000),
        accountId: acc.bank,
        counterAccountId: acc.savings,
        occurredOn: day(16),
        description: 'Monthly savings',
      });
      add({
        type: 'transfer',
        amount: peso(3_000),
        accountId: acc.bank,
        counterAccountId: acc.gcash,
        occurredOn: day(2),
        description: 'Top up e-wallet',
      });
      add({
        type: 'transfer',
        amount: peso(4_000),
        accountId: acc.bank,
        counterAccountId: acc.card,
        occurredOn: day(20),
        description: 'Card payment',
      });
      for (const [d, amt, desc] of [
        [3, 2_340, 'Weekly groceries'],
        [10, 1_985, 'Weekly groceries'],
        [17, 2_610, 'Weekly groceries'],
        [24, 2_150, 'Weekly groceries'],
      ] as const) {
        add({
          type: 'expense',
          amount: peso(amt),
          accountId: acc.cash,
          categoryId: cat('Groceries'),
          occurredOn: day(d),
          description: desc,
        });
      }
      for (const [d, amt, desc] of [
        [4, 420, 'Lunch with team'],
        [9, 285, 'Coffee'],
        [14, 1_250, 'Dinner out'],
        [21, 360, 'Food delivery'],
        [26, 540, 'Lunch'],
      ] as const) {
        add({
          type: 'expense',
          amount: peso(amt),
          accountId: acc.gcash,
          categoryId: cat('Food & Dining'),
          occurredOn: day(d),
          description: desc,
        });
      }
      for (const d of [6, 13, 20, 27]) {
        add({
          type: 'expense',
          amount: peso(650),
          accountId: acc.gcash,
          categoryId: cat('Transport'),
          occurredOn: day(d),
          description: 'Grab rides',
        });
      }
      add({
        type: 'expense',
        amount: peso(3_890),
        accountId: acc.card,
        categoryId: cat('Shopping'),
        occurredOn: day(8),
        description: 'Online shopping',
      });
      add({
        type: 'expense',
        amount: peso(549),
        accountId: acc.card,
        categoryId: cat('Entertainment'),
        occurredOn: day(11),
        description: 'Streaming subscription',
      });
    }
    add({
      type: 'refund',
      amount: peso(890),
      accountId: acc.card,
      categoryId: cat('Shopping'),
      occurredOn: addDays(today, -1),
      description: 'Returned item',
    });
    if (txs.length) await tx.insert(transactions).values(txs);

    const ev = (e: Omit<typeof scheduledEvents.$inferInsert, 'userId' | 'isDemo'>) => ({
      ...e,
      userId,
      isDemo: true,
    });
    await tx.insert(scheduledEvents).values([
      ev({
        name: 'Salary',
        direction: 'inflow',
        kind: 'salary',
        status: 'recurring',
        amount: peso(32_500),
        confidence: 'confirmed',
        accountId: acc.bank,
        categoryId: cat('Salary'),
        startDate: addDays(today, 1), // paydays already in history are not projected again
        frequency: 'semimonthly',
        dayOfMonth: 15,
        secondDayOfMonth: 31,
      }),
      ev({
        name: 'Client retainer — Studio Contract',
        direction: 'inflow',
        kind: 'contract',
        status: 'recurring',
        amount: peso(18_000),
        amountMin: peso(15_000),
        amountMax: peso(18_000),
        confidence: 'likely',
        accountId: acc.bank,
        categoryId: cat('Freelance'),
        startDate: addDays(today, 10),
        frequency: 'monthly',
        endDate: addMonthsClamped(today, 2),
        notes: 'Contract ends after two more payments.',
      }),
      ev({
        name: 'Possible year-end bonus',
        direction: 'inflow',
        kind: 'income',
        status: 'planned',
        amount: peso(30_000),
        confidence: 'uncertain',
        accountId: acc.bank,
        categoryId: cat('Other Income'),
        startDate: addDays(today, 40),
      }),
      ev({
        name: 'Rent',
        direction: 'outflow',
        kind: 'bill',
        status: 'recurring',
        amount: peso(18_000),
        accountId: acc.bank,
        categoryId: cat('Housing'),
        startDate:
          today.slice(8) < '05'
            ? addDays(startOfMonth(today), 4)
            : addMonthsClamped(startOfMonth(today), 1, 5),
        frequency: 'monthly',
      }),
      ev({
        name: 'Electricity',
        direction: 'outflow',
        kind: 'bill',
        status: 'recurring',
        amount: peso(2_700),
        amountMin: peso(2_200),
        amountMax: peso(3_400),
        accountId: acc.bank,
        categoryId: cat('Bills & Utilities'),
        startDate:
          today.slice(8) < '12'
            ? addDays(startOfMonth(today), 11)
            : addMonthsClamped(startOfMonth(today), 1, 12),
        frequency: 'monthly',
      }),
      ev({
        name: 'Laptop',
        direction: 'outflow',
        kind: 'purchase',
        status: 'planned',
        amount: peso(25_000),
        accountId: acc.bank,
        categoryId: cat('Electronics'),
        startDate: addDays(today, 38),
        notes: 'Planned upgrade — try "Can I afford this?" before committing.',
      }),
      ev({
        name: 'Phone (6 installments)',
        direction: 'outflow',
        kind: 'purchase',
        status: 'committed',
        amount: peso(24_000),
        accountId: acc.card,
        categoryId: cat('Electronics'),
        startDate: addDays(today, 20),
        frequency: 'monthly',
        installments: 6,
      }),
    ]);

    await tx.insert(budgets).values(
      [
        ['Food & Dining', 6_000],
        ['Groceries', 10_000],
        ['Transport', 3_000],
        ['Shopping', 4_000],
        ['Entertainment', 1_500],
      ]
        .filter(([name]) => cat(name as string))
        .map(([name, amount]) => ({
          userId,
          categoryId: cat(name as string),
          amount: peso(amount as number),
          isDemo: true,
        })),
    );

    const efund = randomUUID();
    const travel = randomUUID();
    await tx.insert(goals).values([
      {
        id: efund,
        userId,
        name: 'Emergency fund',
        kind: 'emergency',
        targetAmount: peso(150_000),
        targetDate: addMonthsClamped(today, 12),
        monthlyContribution: peso(5_000),
        accountId: acc.savings,
        isDemo: true,
      },
      {
        id: travel,
        userId,
        name: 'Japan trip',
        kind: 'travel',
        targetAmount: peso(80_000),
        targetDate: addMonthsClamped(today, 8),
        monthlyContribution: peso(4_000),
        isDemo: true,
      },
    ]);
    await tx.insert(goalAllocations).values([
      {
        userId,
        goalId: efund,
        amount: peso(60_000),
        allocatedOn: opening,
        note: 'Starting balance',
      },
      {
        userId,
        goalId: travel,
        amount: peso(12_000),
        allocatedOn: opening,
        note: 'Starting balance',
      },
    ]);

    await tx
      .update(userSettings)
      .set({
        demoMode: true,
        safetyBuffer: settings.safetyBuffer > 0 ? settings.safetyBuffer : peso(10_000),
        emergencyFundGoalId: settings.emergencyFundGoalId ?? efund,
        updatedAt: new Date(),
      })
      .where(eq(userSettings.userId, userId));
  });
}

async function clearDemo(db: Database, userId: string) {
  await db.transaction(async (tx) => {
    const demoAccounts = await tx
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.userId, userId), eq(accounts.isDemo, true)));
    const demoEvents = await tx
      .select({ id: scheduledEvents.id })
      .from(scheduledEvents)
      .where(and(eq(scheduledEvents.userId, userId), eq(scheduledEvents.isDemo, true)));
    const demoGoals = await tx
      .select({ id: goals.id })
      .from(goals)
      .where(and(eq(goals.userId, userId), eq(goals.isDemo, true)));

    await tx
      .delete(transactions)
      .where(and(eq(transactions.userId, userId), eq(transactions.isDemo, true)));
    if (demoEvents.length) {
      await tx
        .update(transactions)
        .set({ scheduledEventId: null, occurrenceDate: null })
        .where(
          and(
            eq(transactions.userId, userId),
            inArray(
              transactions.scheduledEventId,
              demoEvents.map((e) => e.id),
            ),
          ),
        );
      await tx
        .delete(scheduledEvents)
        .where(and(eq(scheduledEvents.userId, userId), eq(scheduledEvents.isDemo, true)));
    }
    await tx.delete(budgets).where(and(eq(budgets.userId, userId), eq(budgets.isDemo, true)));
    if (demoAccounts.length) {
      await tx
        .update(goals)
        .set({ accountId: null })
        .where(
          and(
            eq(goals.userId, userId),
            inArray(
              goals.accountId,
              demoAccounts.map((a) => a.id),
            ),
          ),
        );
    }
    await tx.delete(goals).where(and(eq(goals.userId, userId), eq(goals.isDemo, true)));
    const settings = await getSettings(tx, userId);
    await tx
      .update(userSettings)
      .set({
        demoMode: false,
        emergencyFundGoalId: demoGoals.some((g) => g.id === settings.emergencyFundGoalId)
          ? null
          : settings.emergencyFundGoalId,
        updatedAt: new Date(),
      })
      .where(eq(userSettings.userId, userId));
    try {
      await tx.delete(accounts).where(and(eq(accounts.userId, userId), eq(accounts.isDemo, true)));
    } catch {
      throw conflict('Some real transactions use demo accounts. Move or delete them first.');
    }
  });
}

export const demoRoutes: FastifyPluginAsyncZod = async (app) => {
  const ok = z.object({ demoMode: z.boolean() });

  app.post(
    '/demo',
    {
      schema: { tags: ['demo'], summary: 'Load clearly flagged demo data', response: { 200: ok } },
    },
    async (request) => {
      const settings = await getSettings(app.db, request.auth.userId);
      if (settings.demoMode) throw conflict('Demo data is already loaded');
      await seedDemo(app.db, request.auth.userId);
      return { demoMode: true };
    },
  );

  app.delete(
    '/demo',
    { schema: { tags: ['demo'], summary: 'Remove all demo data', response: { 200: ok } } },
    async (request) => {
      await clearDemo(app.db, request.auth.userId);
      return { demoMode: false };
    },
  );
};
