import { addDays, buildForecast, expandOccurrences } from '@mm/finance-engine';
import { dashboard, type Dashboard } from '@mm/validation';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { toOccurrenceDto } from '../../lib/mappers.js';
import { loadSnapshot } from '../../lib/snapshot.js';
import { refreshAlerts } from '../alerts/service.js';

export const dashboardRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/dashboard',
    {
      schema: {
        tags: ['dashboard'],
        summary: 'Overview: actual position, this month, safe-to-spend, upcoming items and health',
        response: { 200: dashboard },
      },
    },
    async (request): Promise<Dashboard> => {
      const { userId } = request.auth;
      const snap = await loadSnapshot(app.db, userId);
      const expected = buildForecast(snap.forecastInput(30, 'expected'));
      const conservative = buildForecast(snap.forecastInput(30, 'conservative'));

      const upcomingAll = expandOccurrences(snap.events, snap.overrides, {
        from: snap.today,
        to: addDays(snap.today, 45),
      });
      const nextIncome = upcomingAll.find((o) => o.direction === 'inflow') ?? null;
      const upcoming = upcomingAll.filter((o) => o.date <= addDays(snap.today, 30)).slice(0, 12);

      const overall = snap.budgetRows.find((b) => b.categoryId === null);
      const categoryLimits = snap.budgetRows
        .filter((b) => b.categoryId !== null)
        .reduce((s, b) => s + b.amount, 0);
      const budgetLimit = overall?.amount ?? (categoryLimits > 0 ? categoryLimits : null);
      const remainingDays = Math.max(
        1,
        Number(snap.month.end.slice(8)) - Number(snap.today.slice(8)) + 1,
      );
      const budget =
        budgetLimit === null
          ? null
          : {
              limit: budgetLimit,
              spent: snap.month.netSpending,
              remaining: budgetLimit - snap.month.netSpending,
              dailyAllowance: Math.max(
                0,
                Math.floor((budgetLimit - snap.month.netSpending) / remainingDays),
              ),
            };

      const activeGoals = snap.goalRows.filter((g) => g.archivedAt === null);
      const goals = {
        target: activeGoals.reduce((s, g) => s + g.targetAmount, 0),
        current: activeGoals.reduce((s, g) => s + Math.max(0, snap.goalCurrent.get(g.id) ?? 0), 0),
        count: activeGoals.length,
      };

      const active = await refreshAlerts(app.db, userId, snap);
      const alertCounts = { critical: 0, warning: 0, info: 0 };
      for (const a of active) alertCounts[a.severity] += 1;

      // Simple, explainable health score: five equally weighted checks.
      const overBudget = active.some((a) => a.rule === 'budget_exceeded');
      const factors = [
        {
          label: 'No projected shortfall in the next 30 days',
          ok: expected.firstShortfallDate === null,
        },
        {
          label: 'Balance stays above your safety buffer',
          ok: expected.firstBelowBufferDate === null,
        },
        {
          label: 'Obligations covered by confirmed income alone',
          ok: conservative.firstShortfallDate === null,
        },
        { label: 'Spending within budgets', ok: !overBudget },
        {
          label: 'Spending less than you earn this month',
          ok: snap.month.income >= snap.month.netSpending,
        },
      ];
      const score = factors.filter((f) => f.ok).length * 20;
      const label =
        score >= 80 ? 'strong' : score >= 60 ? 'stable' : score >= 40 ? 'watch' : 'at_risk';

      const spendingByCategory = [...snap.spendByCategory.entries()]
        .filter(([, amount]) => amount > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([categoryId, amount]) => ({ categoryId, amount }));

      return {
        asOf: snap.today,
        position: snap.position,
        month: {
          key: snap.month.key,
          income: snap.month.income,
          expenses: snap.month.expenses,
          refunds: snap.month.refunds,
          netSpending: snap.month.netSpending,
        },
        budget,
        safeToSpend: conservative.safeToSpend,
        safetyBuffer: snap.settings.safetyBuffer,
        projectedMonthEnd: expected.monthEnd?.balance ?? null,
        lowest30: expected.lowest,
        nextIncome: nextIncome ? toOccurrenceDto(nextIncome) : null,
        upcoming: upcoming.map(toOccurrenceDto),
        goals,
        spendingByCategory,
        health: { score, label, factors },
        alertCounts,
        isEmpty: snap.accountRows.length === 0,
      };
    },
  );
};
