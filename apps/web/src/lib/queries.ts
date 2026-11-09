'use client';

import type {
  Account,
  Alert,
  Category,
  ForecastResponse,
  Me,
  TransactionPage,
  TransactionQuery,
} from '@mm/api-client';
import type { ForecastMode } from '@mm/types';
import { todayInTimeZone } from '@mm/finance-engine';
import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { useMemo } from 'react';
import { useApi } from './api';
import { resolveFeatures } from './features';

export type TransactionFilters = Omit<TransactionQuery, 'cursor' | 'limit'>;

export const qk = {
  me: ['me'] as const,
  dashboard: ['dashboard'] as const,
  accounts: ['accounts'] as const,
  categories: ['categories'] as const,
  transactions: ['transactions'] as const,
  transactionList: (filters: TransactionFilters) => ['transactions', 'list', filters] as const,
  planner: ['planner'] as const,
  plannerEvents: ['planner', 'events'] as const,
  occurrences: (from: string, to: string) => ['planner', 'occurrences', from, to] as const,
  forecast: ['forecast'] as const,
  forecastQuery: (params: ForecastParams) => ['forecast', params] as const,
  budgets: ['budgets'] as const,
  budgetMonth: (month: string) => ['budgets', month] as const,
  goals: ['goals'] as const,
  goalAllocations: (id: string) => ['goals', id, 'allocations'] as const,
  alerts: ['alerts'] as const,
  alertList: (status: AlertStatusFilter) => ['alerts', status] as const,
};

type AlertStatusFilter = 'active' | 'dismissed' | 'resolved';

export interface ForecastParams {
  horizonDays: number;
  historyDays: number;
  mode: ForecastMode;
  includeBudgetedSpending?: boolean;
}

/**
 * Everything derived from actual money movements. Called after transactions, mark-paid, CSV
 * import and account changes.
 */
export function invalidateFinancial(qc: QueryClient): Promise<void> {
  const keys = [
    qk.dashboard,
    qk.accounts,
    qk.transactions,
    qk.forecast,
    qk.budgets,
    qk.goals,
    qk.alerts,
    qk.planner,
  ];
  return Promise.all(keys.map((queryKey) => qc.invalidateQueries({ queryKey }))).then(() => {});
}

/** Planned items only change projections (never actual balances). */
export function invalidatePlanning(qc: QueryClient): Promise<void> {
  const keys = [qk.planner, qk.dashboard, qk.forecast, qk.alerts, qk.budgets];
  return Promise.all(keys.map((queryKey) => qc.invalidateQueries({ queryKey }))).then(() => {});
}

export function invalidateKeys(qc: QueryClient, keys: ReadonlyArray<readonly unknown[]>) {
  return Promise.all(keys.map((queryKey) => qc.invalidateQueries({ queryKey }))).then(() => {});
}

// ── Queries ──────────────────────────────────────────────────────────────

export function useMe() {
  const api = useApi();
  return useQuery<Me>({ queryKey: qk.me, queryFn: () => api.me(), staleTime: 60_000 });
}

/** Feature toggles from Settings, with defaults filled in (everything on until /me loads). */
export function useFeatures() {
  const me = useMe();
  const features = me.data?.settings.features;
  return useMemo(() => resolveFeatures(features), [features]);
}

/** User's timezone (falls back to Asia/Manila until /me has loaded). */
export function useTimezone(): string {
  const me = useMe();
  return me.data?.settings.timezone ?? 'Asia/Manila';
}

/** "Today" as a calendar date in the user's timezone. */
export function useToday(): string {
  const tz = useTimezone();
  return useMemo(() => todayInTimeZone(tz), [tz]);
}

export function useDashboard() {
  const api = useApi();
  return useQuery({ queryKey: qk.dashboard, queryFn: () => api.dashboard() });
}

export function useAccounts() {
  const api = useApi();
  return useQuery<Account[]>({ queryKey: qk.accounts, queryFn: () => api.accounts.list() });
}

export function useCategories() {
  const api = useApi();
  return useQuery<Category[]>({
    queryKey: qk.categories,
    queryFn: () => api.categories.list(),
    staleTime: 5 * 60_000,
  });
}

export function useForecast(params: ForecastParams, enabled = true) {
  const api = useApi();
  return useQuery<ForecastResponse>({
    queryKey: qk.forecastQuery(params),
    queryFn: () => api.forecast.get(params),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useTransactions(filters: TransactionFilters, pageSize = 50) {
  const api = useApi();
  return useInfiniteQuery<TransactionPage>({
    queryKey: qk.transactionList(filters),
    queryFn: ({ pageParam }) =>
      api.transactions.list({
        ...filters,
        limit: pageSize,
        cursor: (pageParam as string | undefined) ?? undefined,
      }),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
  });
}

export function useOccurrences(from: string, to: string) {
  const api = useApi();
  return useQuery({
    queryKey: qk.occurrences(from, to),
    queryFn: () => api.planner.occurrences(from, to),
    placeholderData: keepPreviousData,
  });
}

export function usePlannerEvents() {
  const api = useApi();
  return useQuery({ queryKey: qk.plannerEvents, queryFn: () => api.planner.list() });
}

export function useBudgets(month: string) {
  const api = useApi();
  return useQuery({
    queryKey: qk.budgetMonth(month),
    queryFn: () => api.budgets.list(month),
    placeholderData: keepPreviousData,
  });
}

export function useGoals() {
  const api = useApi();
  return useQuery({ queryKey: qk.goals, queryFn: () => api.goals.list() });
}

export function useGoalAllocations(goalId: string | null) {
  const api = useApi();
  return useQuery({
    queryKey: qk.goalAllocations(goalId ?? 'none'),
    queryFn: () => api.goals.allocations(goalId!),
    enabled: !!goalId,
  });
}

export function useAlerts(status: AlertStatusFilter = 'active') {
  const api = useApi();
  return useQuery<Alert[]>({
    queryKey: qk.alertList(status),
    queryFn: () => api.alerts.list(status),
  });
}

/** Lookup maps for rendering names from ids. */
export function useLookups() {
  const accounts = useAccounts();
  const categories = useCategories();
  return useMemo(() => {
    const accountById = new Map((accounts.data ?? []).map((a) => [a.id, a]));
    const categoryById = new Map((categories.data ?? []).map((c) => [c.id, c]));
    return {
      accounts: accounts.data ?? [],
      categories: categories.data ?? [],
      accountById,
      categoryById,
      accountName: (id: string | null | undefined) =>
        id ? (accountById.get(id)?.name ?? 'Unknown account') : '—',
      categoryName: (id: string | null | undefined) =>
        id ? (categoryById.get(id)?.name ?? 'Unknown category') : 'Uncategorised',
      isLoading: accounts.isLoading || categories.isLoading,
    };
  }, [accounts.data, categories.data, accounts.isLoading, categories.isLoading]);
}

export { useQueryClient };
