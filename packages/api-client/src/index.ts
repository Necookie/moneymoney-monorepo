import type {
  Account,
  AffordabilityRequest,
  AffordabilityResponse,
  Alert,
  Budget,
  Category,
  CreateAccount,
  CreateBudget,
  CreateCategory,
  CreateGoal,
  CreateGoalAllocation,
  CreateScheduledEvent,
  CreateTransaction,
  CsvImportRequest,
  CsvImportResult,
  Dashboard,
  ErrorResponse,
  ForecastResponse,
  Goal,
  GoalAllocation,
  MarkOccurrencePaid,
  Me,
  OccurrenceDto,
  OccurrenceOverrideDto,
  ScenarioRequest,
  ScenarioResponse,
  ScheduledEvent,
  Settings,
  SyncPullResponse,
  SyncPushRequest,
  SyncPushResponse,
  Transaction,
  TransactionPage,
  TransactionQuery,
  UpdateAccount,
  UpdateBudget,
  UpdateCategory,
  UpdateGoal,
  UpdateScheduledEvent,
  UpdateSettings,
  UpdateTransaction,
} from '@mm/validation';
import type { ForecastMode } from '@mm/types';

export type * from '@mm/validation';

/** Error thrown for any non-2xx response, carrying the API's error envelope. */
export class ApiError extends Error {
  override name = 'ApiError';
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly requestId?: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }

  /** True for failures worth retrying later (offline, timeouts, 5xx, rate limits). */
  get retryable(): boolean {
    return this.status === 0 || this.status === 408 || this.status === 429 || this.status >= 500;
  }
}

export interface ApiClientOptions {
  /** e.g. https://api.moneymoney.necookie.dev */
  baseUrl: string;
  /** Returns a fresh Clerk session token (or null when signed out). */
  getToken: () => Promise<string | null>;
  fetch?: typeof fetch;
  /** Per-request timeout in ms (default 20s). */
  timeoutMs?: number;
}

type Query = Record<string, string | number | boolean | undefined | null>;

function qs(query?: Query): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

export function createApiClient(options: ApiClientOptions) {
  const base = options.baseUrl.replace(/\/+$/, '');
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);

  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Query,
  ): Promise<T> {
    const token = await options.getToken();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 20_000);
    let res: Response;
    try {
      res = await doFetch(`${base}/api/v1${path}${qs(query)}`, {
        method,
        headers: {
          accept: 'application/json',
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
      });
    } catch (err) {
      const aborted = (err as Error)?.name === 'AbortError';
      throw new ApiError(
        0,
        aborted ? 'timeout' : 'network_error',
        aborted ? 'Request timed out' : 'Network unavailable',
      );
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 204) return undefined as T;
    const text = await res.text();
    const data = text ? safeParse(text) : null;
    if (!res.ok) {
      const envelope = data as ErrorResponse | null;
      throw new ApiError(
        res.status,
        envelope?.error?.code ?? 'http_error',
        envelope?.error?.message ?? `Request failed (${res.status})`,
        envelope?.error?.requestId ?? res.headers.get('x-request-id') ?? undefined,
        envelope?.error?.details,
      );
    }
    return (data ?? (text as unknown)) as T;
  }

  const get = <T>(path: string, query?: Query) => request<T>('GET', path, undefined, query);
  const post = <T>(path: string, body: unknown = {}) => request<T>('POST', path, body);
  const patch = <T>(path: string, body: unknown) => request<T>('PATCH', path, body);
  const del = (path: string) => request<void>('DELETE', path);

  return {
    request,
    me: () => get<Me>('/me'),
    settings: {
      get: () => get<Settings>('/settings'),
      update: (body: UpdateSettings) => patch<Settings>('/settings', body),
    },
    dashboard: () => get<Dashboard>('/dashboard'),
    accounts: {
      list: () => get<Account[]>('/accounts'),
      get: (id: string) => get<Account>(`/accounts/${id}`),
      create: (body: CreateAccount) => post<Account>('/accounts', body),
      update: (id: string, body: UpdateAccount) => patch<Account>(`/accounts/${id}`, body),
      remove: (id: string) => del(`/accounts/${id}`),
    },
    categories: {
      list: () => get<Category[]>('/categories'),
      create: (body: CreateCategory) => post<Category>('/categories', body),
      update: (id: string, body: UpdateCategory) => patch<Category>(`/categories/${id}`, body),
    },
    transactions: {
      list: (query: TransactionQuery = {}) => get<TransactionPage>('/transactions', query as Query),
      get: (id: string) => get<Transaction>(`/transactions/${id}`),
      /** Idempotent: always pass a client-generated `id` (crypto.randomUUID()). */
      create: (body: CreateTransaction) => post<Transaction>('/transactions', body),
      update: (id: string, body: UpdateTransaction) =>
        patch<Transaction>(`/transactions/${id}`, body),
      remove: (id: string) => del(`/transactions/${id}`),
      exportCsv: (query: Omit<TransactionQuery, 'cursor' | 'limit'> = {}) =>
        get<string>('/transactions/export.csv', query as Query),
      importCsv: (body: CsvImportRequest) => post<CsvImportResult>('/transactions/import', body),
    },
    planner: {
      list: () => get<ScheduledEvent[]>('/scheduled-events'),
      get: (id: string) =>
        get<ScheduledEvent & { overrides: OccurrenceOverrideDto[] }>(`/scheduled-events/${id}`),
      create: (body: CreateScheduledEvent) => post<ScheduledEvent>('/scheduled-events', body),
      update: (id: string, body: UpdateScheduledEvent) =>
        patch<ScheduledEvent>(`/scheduled-events/${id}`, body),
      remove: (id: string) => del(`/scheduled-events/${id}`),
      occurrences: (from: string, to: string) =>
        get<OccurrenceDto[]>('/scheduled-events/occurrences', { from, to }),
      postpone: (id: string, occurrenceDate: string, newDate: string) =>
        post<ScheduledEvent>(`/scheduled-events/${id}/postpone`, { occurrenceDate, newDate }),
      skip: (id: string, occurrenceDate: string) =>
        post<ScheduledEvent>(`/scheduled-events/${id}/skip`, { occurrenceDate }),
      cancel: (id: string) => post<ScheduledEvent>(`/scheduled-events/${id}/cancel`),
      split: (id: string, body: { amount: number; startDate: string; name?: string }) =>
        post<{ original: ScheduledEvent; created: ScheduledEvent }>(
          `/scheduled-events/${id}/split`,
          body,
        ),
      markPaid: (id: string, body: MarkOccurrencePaid) =>
        post<Transaction>(`/scheduled-events/${id}/mark-paid`, body),
    },
    budgets: {
      list: (month?: string) => get<Budget[]>('/budgets', { month }),
      create: (body: CreateBudget) => post<Budget>('/budgets', body),
      update: (id: string, body: UpdateBudget) => patch<Budget>(`/budgets/${id}`, body),
      remove: (id: string) => del(`/budgets/${id}`),
    },
    goals: {
      list: () => get<Goal[]>('/goals'),
      create: (body: CreateGoal) => post<Goal>('/goals', body),
      update: (id: string, body: UpdateGoal) => patch<Goal>(`/goals/${id}`, body),
      remove: (id: string) => del(`/goals/${id}`),
      allocations: (id: string) => get<GoalAllocation[]>(`/goals/${id}/allocations`),
      allocate: (id: string, body: CreateGoalAllocation) =>
        post<GoalAllocation>(`/goals/${id}/allocations`, body),
      removeAllocation: (id: string, allocationId: string) =>
        del(`/goals/${id}/allocations/${allocationId}`),
    },
    forecast: {
      get: (
        query: {
          horizonDays?: number;
          mode?: ForecastMode;
          historyDays?: number;
          includeBudgetedSpending?: boolean;
        } = {},
      ) => get<ForecastResponse>('/forecast', query),
      scenarios: (body: ScenarioRequest) => post<ScenarioResponse>('/forecast/scenarios', body),
      affordability: (body: AffordabilityRequest) =>
        post<AffordabilityResponse>('/forecast/affordability', body),
    },
    alerts: {
      list: (status: 'active' | 'dismissed' | 'resolved' = 'active') =>
        get<Alert[]>('/alerts', { status }),
      dismiss: (id: string) => post<Alert>(`/alerts/${id}/dismiss`),
    },
    sync: {
      push: (body: SyncPushRequest) => post<SyncPushResponse>('/sync/push', body),
      pull: (since?: string) => get<SyncPullResponse>('/sync/pull', { since }),
    },
    demo: {
      load: () => post<{ demoMode: boolean }>('/demo'),
      clear: () => request<{ demoMode: boolean }>('DELETE', '/demo'),
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
