import type { Centavos, IsoDate } from '@mm/types';
import { addDays } from './dates.js';
import { buildForecast, type ForecastInput, type ForecastResult } from './forecast.js';
import { multiplyRatio } from './money.js';
import {
  effectiveRule,
  scheduleDates,
  type EngineEvent,
  type OccurrenceOverride,
} from './recurrence.js';

export type Scenario =
  | { type: 'baseline'; label?: string }
  /** Every salary (or the listed inflow events) arrives `days` late. */
  | { type: 'salary_delayed'; days: number; eventIds?: string[]; label?: string }
  /** Income stops from a date (all inflows, or the listed events). */
  | { type: 'income_lost'; fromDate: IsoDate; eventIds?: string[]; label?: string }
  /** A hypothetical purchase, optionally paid in monthly installments. */
  | {
      type: 'purchase_added';
      amount: Centavos;
      date: IsoDate;
      name?: string;
      accountId?: string | null;
      categoryId?: string | null;
      installments?: number | null;
      label?: string;
    }
  /** Move a planned purchase/expense to a new date. */
  | { type: 'purchase_postponed'; eventId: string; newDate: IsoDate; label?: string }
  /** Cut budgets and variable expenses by a percentage. */
  | { type: 'spending_reduced'; percent: number; label?: string };

export const SCENARIO_PURCHASE_ID = 'scenario:purchase';

/** Return a new forecast input with the scenario applied. The original is never mutated. */
export function applyScenario(input: ForecastInput, scenario: Scenario): ForecastInput {
  const events = [...input.events];
  const overrides = [...(input.overrides ?? [])];
  const endDate = addDays(input.asOf, input.horizonDays);

  switch (scenario.type) {
    case 'baseline':
      return { ...input, events, overrides };

    case 'salary_delayed': {
      const targets = events.filter((e) =>
        scenario.eventIds?.length
          ? scenario.eventIds.includes(e.id)
          : e.direction === 'inflow' && e.kind === 'salary',
      );
      const shifted: OccurrenceOverride[] = [];
      for (const event of targets) {
        for (const [, original] of scheduleDates(event.startDate, effectiveRule(event), endDate)) {
          if (original < input.asOf) continue;
          const existing = overrides.find(
            (o) => o.eventId === event.id && o.occurrenceDate === original,
          );
          if (existing && existing.action !== 'reschedule' && existing.action !== 'amount')
            continue;
          const base =
            existing?.action === 'reschedule' && existing.newDate ? existing.newDate : original;
          shifted.push({
            eventId: event.id,
            occurrenceDate: original,
            action: 'reschedule',
            newDate: addDays(base, scenario.days),
            amount: existing?.amount ?? null,
          });
        }
      }
      const keys = new Set(shifted.map((o) => `${o.eventId}|${o.occurrenceDate}`));
      return {
        ...input,
        events,
        overrides: [
          ...overrides.filter((o) => !keys.has(`${o.eventId}|${o.occurrenceDate}`)),
          ...shifted,
        ],
      };
    }

    case 'income_lost': {
      const stop = addDays(scenario.fromDate, -1);
      return {
        ...input,
        overrides,
        events: events.map((e) => {
          const affected = scenario.eventIds?.length
            ? scenario.eventIds.includes(e.id)
            : e.direction === 'inflow';
          if (!affected) return e;
          const endDateNow =
            e.recurrence.endDate && e.recurrence.endDate < stop ? e.recurrence.endDate : stop;
          return { ...e, recurrence: { ...e.recurrence, endDate: endDateNow } };
        }),
      };
    }

    case 'purchase_added': {
      const installments =
        scenario.installments && scenario.installments > 1 ? scenario.installments : null;
      const purchase: EngineEvent = {
        id: SCENARIO_PURCHASE_ID,
        name: scenario.name ?? 'Hypothetical purchase',
        direction: 'outflow',
        kind: 'purchase',
        status: 'committed',
        amount: scenario.amount,
        confidence: 'confirmed',
        accountId: scenario.accountId ?? null,
        categoryId: scenario.categoryId ?? null,
        startDate: scenario.date,
        recurrence: { frequency: installments ? 'monthly' : 'none' },
        installments,
      };
      return { ...input, overrides, events: [...events, purchase] };
    }

    case 'purchase_postponed': {
      const target = events.find((e) => e.id === scenario.eventId);
      if (!target) return { ...input, events, overrides };
      if (
        target.recurrence.frequency === 'none' &&
        !(target.installments && target.installments > 1)
      ) {
        return {
          ...input,
          overrides,
          events: events.map((e) =>
            e.id === target.id ? { ...e, startDate: scenario.newDate } : e,
          ),
        };
      }
      // Recurring/installment: move the next upcoming occurrence only.
      for (const [, original] of scheduleDates(target.startDate, effectiveRule(target), endDate)) {
        if (original < input.asOf) continue;
        return {
          ...input,
          events,
          overrides: [
            ...overrides.filter((o) => !(o.eventId === target.id && o.occurrenceDate === original)),
            {
              eventId: target.id,
              occurrenceDate: original,
              action: 'reschedule',
              newDate: scenario.newDate,
            },
          ],
        };
      }
      return { ...input, events, overrides };
    }

    case 'spending_reduced': {
      const keep = Math.max(0, Math.min(100, 100 - scenario.percent));
      return {
        ...input,
        overrides,
        budgets: (input.budgets ?? []).map((b) => ({
          ...b,
          limit: multiplyRatio(b.limit, keep, 100),
        })),
        events: events.map((e) =>
          e.direction === 'outflow' && e.kind === 'expense'
            ? {
                ...e,
                amount: multiplyRatio(e.amount, keep, 100),
                amountMin: e.amountMin == null ? null : multiplyRatio(e.amountMin, keep, 100),
                amountMax: e.amountMax == null ? null : multiplyRatio(e.amountMax, keep, 100),
              }
            : e,
        ),
      };
    }
  }
}

export function describeScenario(s: Scenario): string {
  if (s.label) return s.label;
  switch (s.type) {
    case 'baseline':
      return 'Baseline';
    case 'salary_delayed':
      return `Salary delayed ${s.days} day${s.days === 1 ? '' : 's'}`;
    case 'income_lost':
      return `Income stops from ${s.fromDate}`;
    case 'purchase_added':
      return `${s.name ?? 'Purchase'} added`;
    case 'purchase_postponed':
      return `Purchase moved to ${s.newDate}`;
    case 'spending_reduced':
      return `Spending reduced ${s.percent}%`;
  }
}

export interface ScenarioComparison {
  scenario: Scenario;
  label: string;
  result: ForecastResult;
  /** Differences versus the baseline. */
  delta: { endingBalance: Centavos; lowestBalance: Centavos };
}

/** Run the baseline plus each scenario against the same inputs, for side-by-side comparison. */
export function compareScenarios(
  input: ForecastInput,
  scenarios: readonly Scenario[],
): ScenarioComparison[] {
  const baseline = buildForecast(input);
  const all: Scenario[] = [{ type: 'baseline' }, ...scenarios.filter((s) => s.type !== 'baseline')];
  return all.map((scenario) => {
    const result =
      scenario.type === 'baseline' ? baseline : buildForecast(applyScenario(input, scenario));
    return {
      scenario,
      label: describeScenario(scenario),
      result,
      delta: {
        endingBalance: result.endingBalance - baseline.endingBalance,
        lowestBalance: result.lowest.balance - baseline.lowest.balance,
      },
    };
  });
}
