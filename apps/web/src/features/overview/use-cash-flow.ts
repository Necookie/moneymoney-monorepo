'use client';

import type { ForecastMode } from '@mm/types';
import { useMemo } from 'react';
import { buildCashFlowRows } from '@/lib/cash-flow';
import { useForecast } from '@/lib/queries';

export const RANGE_OPTIONS = [
  { value: '7d', label: '7d', days: 7 },
  { value: '30d', label: '30d', days: 30 },
  { value: '90d', label: '90d', days: 90 },
  { value: '12m', label: '12m', days: 365 },
] as const;
export type RangeKey = (typeof RANGE_OPTIONS)[number]['value'];

export function rangeDays(key: RangeKey): number {
  return RANGE_OPTIONS.find((r) => r.value === key)?.days ?? 30;
}

/**
 * Loads history + the selected-mode projection, plus conservative and optimistic runs for the
 * uncertainty band. By default history length mirrors the horizon (capped at the API's 365 days).
 */
export function useCashFlow(
  horizonDays: number,
  options: { mode?: ForecastMode; historyDays?: number; includeBudgetedSpending?: boolean } = {},
) {
  const mode = options.mode ?? 'expected';
  const historyDays = options.historyDays ?? Math.min(365, horizonDays);
  const includeBudgetedSpending = options.includeBudgetedSpending ?? true;
  const main = useForecast({ horizonDays, historyDays, mode, includeBudgetedSpending });
  const low = useForecast({
    horizonDays,
    historyDays: 0,
    mode: 'conservative',
    includeBudgetedSpending,
  });
  const high = useForecast({
    horizonDays,
    historyDays: 0,
    mode: 'optimistic',
    includeBudgetedSpending,
  });

  const rows = useMemo(() => {
    if (!main.data) return null;
    return buildCashFlowRows({
      history: main.data.history,
      expected: main.data.forecast,
      conservative: low.data?.forecast.horizonDays === horizonDays ? low.data.forecast : null,
      optimistic: high.data?.forecast.horizonDays === horizonDays ? high.data.forecast : null,
    });
  }, [main.data, low.data, high.data, horizonDays]);

  return { main, rows, forecast: main.data?.forecast ?? null };
}
