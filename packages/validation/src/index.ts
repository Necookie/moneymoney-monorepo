import {
  ACCOUNT_TYPES,
  ALERT_RULES,
  ALERT_SEVERITIES,
  ALERT_STATUSES,
  CATEGORY_KINDS,
  CONFIDENCE_LEVELS,
  CURRENCIES,
  EVENT_DIRECTIONS,
  EVENT_KINDS,
  EVENT_STATUSES,
  FORECAST_MODES,
  GOAL_KINDS,
  MONTH_END_RULES,
  OCCURRENCE_ACTIONS,
  RECURRENCE_FREQUENCIES,
  SYNC_OPS,
  TRANSACTION_TYPES,
} from '@mm/types';
import { z } from 'zod';

/**
 * Wire format conventions:
 * - Money: integer centavos (`1234.50 PHP` → `123450`).
 * - Dates: `YYYY-MM-DD` calendar dates in the user's timezone. Timestamps: ISO-8601.
 */

const MAX_CENTAVOS = 1_000_000_000_000_00; // ₱1 trillion — sanity bound for a personal finance app

export const centavos = z.number().int().min(-MAX_CENTAVOS).max(MAX_CENTAVOS);
export const positiveCentavos = z.number().int().positive().max(MAX_CENTAVOS);
export const nonNegativeCentavos = z.number().int().min(0).max(MAX_CENTAVOS);

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')
  .refine((s) => {
    const [y, m, d] = s.split('-').map(Number) as [number, number, number];
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }, 'Invalid calendar date');

export const uuid = z.uuid();
export const timestamp = z.string();
const name = z.string().trim().min(1).max(120);
const notes = z.string().trim().max(2_000);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const icon = z.string().trim().min(1).max(48);

export const currency = z.enum(CURRENCIES);
export const accountType = z.enum(ACCOUNT_TYPES);
export const transactionType = z.enum(TRANSACTION_TYPES);
export const categoryKind = z.enum(CATEGORY_KINDS);
export const eventDirection = z.enum(EVENT_DIRECTIONS);
export const eventKind = z.enum(EVENT_KINDS);
export const eventStatus = z.enum(EVENT_STATUSES);
export const confidence = z.enum(CONFIDENCE_LEVELS);
export const recurrenceFrequency = z.enum(RECURRENCE_FREQUENCIES);
export const monthEndRule = z.enum(MONTH_END_RULES);
export const occurrenceAction = z.enum(OCCURRENCE_ACTIONS);
export const forecastMode = z.enum(FORECAST_MODES);
export const goalKind = z.enum(GOAL_KINDS);
export const alertRule = z.enum(ALERT_RULES);
export const alertSeverity = z.enum(ALERT_SEVERITIES);
export const alertStatus = z.enum(ALERT_STATUSES);

// ── Errors ───────────────────────────────────────────────────────────────
export const errorResponse = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string().optional(),
    details: z.unknown().optional(),
  }),
});
export type ErrorResponse = z.infer<typeof errorResponse>;

// ── Settings ─────────────────────────────────────────────────────────────
export const settings = z.object({
  currency,
  timezone: z.string(),
  safetyBuffer: nonNegativeCentavos,
  emergencyFundGoalId: uuid.nullable(),
  demoMode: z.boolean(),
  updatedAt: timestamp,
});
export type Settings = z.infer<typeof settings>;

export const updateSettings = z
  .object({
    timezone: z.string().min(1).max(64),
    safetyBuffer: nonNegativeCentavos,
    emergencyFundGoalId: uuid.nullable(),
  })
  .partial();
export type UpdateSettings = z.infer<typeof updateSettings>;

export const me = z.object({
  userId: uuid,
  email: z.string().nullable(),
  settings,
});
export type Me = z.infer<typeof me>;

// ── Accounts ─────────────────────────────────────────────────────────────
export const account = z.object({
  id: uuid,
  name: z.string(),
  type: accountType,
  currency,
  /** Signed: credit accounts are negative when money is owed. */
  openingBalance: centavos,
  openingDate: isoDate,
  /** Current signed balance including all transactions. */
  balance: centavos,
  color: z.string().nullable(),
  icon: z.string().nullable(),
  archived: z.boolean(),
  isDemo: z.boolean(),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type Account = z.infer<typeof account>;

export const createAccount = z.object({
  id: uuid.optional(),
  name,
  type: accountType,
  currency: currency.default('PHP'),
  openingBalance: centavos.default(0),
  openingDate: isoDate,
  color: color.nullish(),
  icon: icon.nullish(),
});
export type CreateAccount = z.input<typeof createAccount>;

export const updateAccount = z
  .object({
    name,
    openingBalance: centavos,
    openingDate: isoDate,
    color: color.nullable(),
    icon: icon.nullable(),
    archived: z.boolean(),
  })
  .partial();
export type UpdateAccount = z.infer<typeof updateAccount>;

// ── Categories ───────────────────────────────────────────────────────────
export const category = z.object({
  id: uuid,
  name: z.string(),
  kind: categoryKind,
  color: z.string().nullable(),
  icon: z.string().nullable(),
  archived: z.boolean(),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type Category = z.infer<typeof category>;

export const createCategory = z.object({
  id: uuid.optional(),
  name,
  kind: categoryKind,
  color: color.nullish(),
  icon: icon.nullish(),
});
export type CreateCategory = z.input<typeof createCategory>;
export const updateCategory = z
  .object({ name, color: color.nullable(), icon: icon.nullable(), archived: z.boolean() })
  .partial();
export type UpdateCategory = z.infer<typeof updateCategory>;

// ── Transactions ─────────────────────────────────────────────────────────
export const transaction = z.object({
  id: uuid,
  type: transactionType,
  /** Positive, except `adjustment` which is signed. */
  amount: centavos,
  accountId: uuid,
  counterAccountId: uuid.nullable(),
  categoryId: uuid.nullable(),
  occurredOn: isoDate,
  description: z.string(),
  notes: z.string().nullable(),
  tags: z.array(z.string()),
  scheduledEventId: uuid.nullable(),
  occurrenceDate: isoDate.nullable(),
  isDemo: z.boolean(),
  createdAt: timestamp,
  updatedAt: timestamp,
  deletedAt: timestamp.nullable(),
});
export type Transaction = z.infer<typeof transaction>;

const tags = z.array(z.string().trim().min(1).max(32)).max(20);

const transactionFields = {
  type: transactionType,
  amount: centavos,
  accountId: uuid,
  counterAccountId: uuid.nullish(),
  categoryId: uuid.nullish(),
  occurredOn: isoDate,
  description: z.string().trim().max(200),
  notes: notes.nullish(),
  tags,
};
// Update schemas are built from fields WITHOUT defaults: in Zod 4, `.partial()` still applies
// inner defaults, which would silently reset omitted fields on PATCH.
const transactionBase = z.object(transactionFields);

function refineTransaction<T extends z.ZodType<Partial<z.infer<typeof transactionBase>>>>(
  schema: T,
) {
  return schema.superRefine((tx, ctx) => {
    if (tx.type === undefined || tx.amount === undefined) return;
    if (tx.type === 'adjustment') {
      if (tx.amount === 0)
        ctx.addIssue({ code: 'custom', path: ['amount'], message: 'Adjustment cannot be zero' });
    } else if (tx.amount <= 0) {
      ctx.addIssue({ code: 'custom', path: ['amount'], message: 'Amount must be positive' });
    }
    if (tx.type === 'transfer') {
      if (!tx.counterAccountId)
        ctx.addIssue({
          code: 'custom',
          path: ['counterAccountId'],
          message: 'Transfers need a destination account',
        });
      else if (tx.counterAccountId === tx.accountId)
        ctx.addIssue({
          code: 'custom',
          path: ['counterAccountId'],
          message: 'Cannot transfer to the same account',
        });
    } else if (tx.counterAccountId) {
      ctx.addIssue({
        code: 'custom',
        path: ['counterAccountId'],
        message: 'Only transfers have a destination account',
      });
    }
  });
}

/** `id` is client-generated (UUID v4/v7) so retries are idempotent. */
export const createTransaction = refineTransaction(
  transactionBase.extend({
    description: transactionFields.description.default(''),
    tags: tags.default([]),
    id: uuid,
    scheduledEventId: uuid.nullish(),
    occurrenceDate: isoDate.nullish(),
  }),
);
export type CreateTransaction = z.input<typeof createTransaction>;

export const updateTransaction = refineTransaction(transactionBase.partial());
export type UpdateTransaction = z.input<typeof updateTransaction>;

export const transactionQuery = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  accountId: uuid.optional(),
  categoryId: uuid.optional(),
  type: transactionType.optional(),
  tag: z.string().optional(),
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  cursor: z.string().optional(),
});
export type TransactionQuery = z.input<typeof transactionQuery>;

export const transactionPage = z.object({
  items: z.array(transaction),
  nextCursor: z.string().nullable(),
  totals: z.object({ income: centavos, expenses: centavos, refunds: centavos, net: centavos }),
  /** Exact counts per type for the same filters, ignoring the `type` filter (for filter chips). */
  countsByType: z.object({
    income: z.number().int(),
    expense: z.number().int(),
    transfer: z.number().int(),
    refund: z.number().int(),
    adjustment: z.number().int(),
  }),
});
export type TransactionPage = z.infer<typeof transactionPage>;

export const csvImportRequest = z.object({
  csv: z.string().min(1).max(5_000_000),
  /** Account used when the CSV has no account column. */
  defaultAccountId: uuid.optional(),
  dryRun: z.boolean().default(true),
});
export type CsvImportRequest = z.input<typeof csvImportRequest>;

export const csvImportResult = z.object({
  dryRun: z.boolean(),
  imported: z.number().int(),
  skippedDuplicates: z.number().int(),
  errors: z.array(z.object({ line: z.number().int(), message: z.string() })),
  preview: z.array(
    z.object({
      line: z.number().int(),
      occurredOn: isoDate,
      type: transactionType,
      amount: centavos,
      description: z.string(),
      account: z.string(),
      category: z.string().nullable(),
    }),
  ),
});
export type CsvImportResult = z.infer<typeof csvImportResult>;

// ── Scheduled events ─────────────────────────────────────────────────────
export const recurrence = z.object({
  frequency: recurrenceFrequency,
  interval: z.number().int().min(1).max(52).default(1),
  dayOfMonth: z.number().int().min(1).max(31).nullable().default(null),
  secondDayOfMonth: z.number().int().min(1).max(31).nullable().default(null),
  monthEndRule: monthEndRule.default('clamp'),
  endDate: isoDate.nullable().default(null),
  count: z.number().int().min(1).max(1_000).nullable().default(null),
});
export type Recurrence = z.infer<typeof recurrence>;

export const scheduledEvent = z.object({
  id: uuid,
  name: z.string(),
  direction: eventDirection,
  kind: eventKind,
  status: eventStatus,
  amount: positiveCentavos,
  amountMin: positiveCentavos.nullable(),
  amountMax: positiveCentavos.nullable(),
  currency,
  confidence,
  accountId: uuid.nullable(),
  categoryId: uuid.nullable(),
  startDate: isoDate,
  recurrence,
  installments: z.number().int().nullable(),
  notes: z.string().nullable(),
  isDemo: z.boolean(),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type ScheduledEvent = z.infer<typeof scheduledEvent>;

const scheduledEventBase = z.object({
  name,
  direction: eventDirection,
  kind: eventKind,
  status: eventStatus,
  amount: positiveCentavos,
  amountMin: positiveCentavos.nullish(),
  amountMax: positiveCentavos.nullish(),
  currency,
  confidence,
  accountId: uuid.nullish(),
  categoryId: uuid.nullish(),
  startDate: isoDate,
  recurrence,
  installments: z.number().int().min(2).max(120).nullish(),
  notes: notes.nullish(),
});

const NO_RECURRENCE = {
  frequency: 'none',
  interval: 1,
  dayOfMonth: null,
  secondDayOfMonth: null,
  monthEndRule: 'clamp',
  endDate: null,
  count: null,
} as const;

function refineEvent<T extends z.ZodType<Partial<z.infer<typeof scheduledEventBase>>>>(schema: T) {
  return schema.superRefine((e, ctx) => {
    if (e.amountMin != null && e.amountMax != null && e.amountMin > e.amountMax)
      ctx.addIssue({ code: 'custom', path: ['amountMin'], message: 'Minimum exceeds maximum' });
    if (e.amount != null && e.amountMin != null && e.amountMin > e.amount)
      ctx.addIssue({
        code: 'custom',
        path: ['amountMin'],
        message: 'Minimum exceeds expected amount',
      });
    if (e.amount != null && e.amountMax != null && e.amountMax < e.amount)
      ctx.addIssue({
        code: 'custom',
        path: ['amountMax'],
        message: 'Maximum is below expected amount',
      });
    if (e.recurrence?.endDate && e.startDate && e.recurrence.endDate < e.startDate)
      ctx.addIssue({
        code: 'custom',
        path: ['recurrence', 'endDate'],
        message: 'End date is before the start date',
      });
  });
}

export const createScheduledEvent = refineEvent(
  scheduledEventBase.extend({
    id: uuid.optional(),
    status: eventStatus.default('planned'),
    currency: currency.default('PHP'),
    confidence: confidence.default('confirmed'),
    recurrence: recurrence.default(NO_RECURRENCE),
  }),
);
export type CreateScheduledEvent = z.input<typeof createScheduledEvent>;
export const updateScheduledEvent = refineEvent(scheduledEventBase.partial());
export type UpdateScheduledEvent = z.input<typeof updateScheduledEvent>;

export const occurrenceOverride = z.object({
  id: uuid,
  eventId: uuid,
  occurrenceDate: isoDate,
  action: occurrenceAction,
  newDate: isoDate.nullable(),
  amount: positiveCentavos.nullable(),
  transactionId: uuid.nullable(),
});
export type OccurrenceOverrideDto = z.infer<typeof occurrenceOverride>;

export const postponeOccurrence = z.object({ occurrenceDate: isoDate, newDate: isoDate });
export const skipOccurrence = z.object({ occurrenceDate: isoDate });
export const splitEvent = z.object({
  /** Amount moved into the new event (the rest stays on the original). */
  amount: positiveCentavos,
  startDate: isoDate,
  name: name.optional(),
});
export const markOccurrencePaid = z.object({
  occurrenceDate: isoDate,
  /** Client-generated id for the resulting transaction (idempotency). */
  transactionId: uuid,
  amount: positiveCentavos.optional(),
  occurredOn: isoDate.optional(),
  accountId: uuid.optional(),
  categoryId: uuid.nullish(),
});
export type MarkOccurrencePaid = z.input<typeof markOccurrencePaid>;

export const occurrence = z.object({
  eventId: uuid,
  name: z.string(),
  direction: eventDirection,
  kind: eventKind,
  status: eventStatus,
  confidence,
  accountId: uuid.nullable(),
  categoryId: uuid.nullable(),
  date: isoDate,
  originalDate: isoDate,
  amount: positiveCentavos,
  amountMin: positiveCentavos.nullable(),
  amountMax: positiveCentavos.nullable(),
  index: z.number().int(),
  installmentCount: z.number().int().nullable(),
  rescheduled: z.boolean(),
  overdue: z.boolean(),
  settled: z.boolean(),
  skipped: z.boolean(),
  settledTransactionId: uuid.nullable(),
});
export type OccurrenceDto = z.infer<typeof occurrence>;

export const occurrenceQuery = z.object({ from: isoDate, to: isoDate });

// ── Budgets ──────────────────────────────────────────────────────────────
export const budgetStatus = z.object({
  spent: centavos,
  remaining: centavos,
  utilizationBps: z.number().int(),
  projectedSpend: centavos,
  dailyAllowance: centavos,
  remainingDays: z.number().int(),
  state: z.enum(['ok', 'approaching', 'over_pace', 'exceeded']),
});
export const budget = z.object({
  id: uuid,
  categoryId: uuid.nullable(),
  /** Monthly limit. */
  amount: positiveCentavos,
  isDemo: z.boolean(),
  status: budgetStatus,
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type Budget = z.infer<typeof budget>;
export const createBudget = z.object({
  id: uuid.optional(),
  categoryId: uuid.nullable(),
  amount: positiveCentavos,
});
export type CreateBudget = z.input<typeof createBudget>;
export const updateBudget = z.object({ amount: positiveCentavos });
export type UpdateBudget = z.infer<typeof updateBudget>;
export const budgetQuery = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
});

// ── Goals ────────────────────────────────────────────────────────────────
export const goalProjection = z.object({
  remaining: centavos,
  progressBps: z.number().int(),
  complete: z.boolean(),
  monthsToComplete: z.number().int().nullable(),
  estimatedCompletionDate: isoDate.nullable(),
  requiredMonthlyContribution: centavos.nullable(),
  onTrack: z.boolean().nullable(),
});
export const goal = z.object({
  id: uuid,
  name: z.string(),
  kind: goalKind,
  targetAmount: positiveCentavos,
  currentAmount: centavos,
  targetDate: isoDate.nullable(),
  monthlyContribution: nonNegativeCentavos.nullable(),
  accountId: uuid.nullable(),
  archived: z.boolean(),
  isDemo: z.boolean(),
  projection: goalProjection,
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type Goal = z.infer<typeof goal>;
export const createGoal = z.object({
  id: uuid.optional(),
  name,
  kind: goalKind,
  targetAmount: positiveCentavos,
  targetDate: isoDate.nullish(),
  monthlyContribution: nonNegativeCentavos.nullish(),
  accountId: uuid.nullish(),
  initialAmount: nonNegativeCentavos.optional(),
});
export type CreateGoal = z.input<typeof createGoal>;
export const updateGoal = z
  .object({
    name,
    kind: goalKind,
    targetAmount: positiveCentavos,
    targetDate: isoDate.nullable(),
    monthlyContribution: nonNegativeCentavos.nullable(),
    accountId: uuid.nullable(),
    archived: z.boolean(),
  })
  .partial();
export type UpdateGoal = z.infer<typeof updateGoal>;
export const goalAllocation = z.object({
  id: uuid,
  goalId: uuid,
  amount: centavos,
  allocatedOn: isoDate,
  note: z.string().nullable(),
  createdAt: timestamp,
});
export type GoalAllocation = z.infer<typeof goalAllocation>;
export const createGoalAllocation = z.object({
  id: uuid.optional(),
  amount: centavos.refine((v) => v !== 0, 'Amount cannot be zero'),
  allocatedOn: isoDate,
  note: z.string().trim().max(200).nullish(),
});
export type CreateGoalAllocation = z.input<typeof createGoalAllocation>;

// ── Forecasts ────────────────────────────────────────────────────────────
export const forecastQuery = z.object({
  horizonDays: z.coerce.number().int().min(1).max(730).default(30),
  mode: forecastMode.default('expected'),
  historyDays: z.coerce.number().int().min(0).max(365).default(30),
  includeBudgetedSpending: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
});
export type ForecastQuery = z.input<typeof forecastQuery>;

const forecastItem = z.object({
  eventId: z.string(),
  name: z.string(),
  kind: eventKind,
  direction: eventDirection,
  confidence,
  amount: centavos,
  originalDate: isoDate,
  overdue: z.boolean(),
  installment: z.object({ index: z.number().int(), count: z.number().int() }).nullable(),
});
export const forecastPoint = z.object({
  date: isoDate,
  balance: centavos,
  inflow: centavos,
  outflow: centavos,
  budgetedSpending: centavos,
  items: z.array(forecastItem),
});
export const forecastResult = z.object({
  asOf: isoDate,
  endDate: isoDate,
  mode: forecastMode,
  horizonDays: z.number().int(),
  startingBalance: centavos,
  safetyBuffer: centavos,
  points: z.array(forecastPoint),
  endingBalance: centavos,
  lowest: z.object({ balance: centavos, date: isoDate }),
  monthEnd: z.object({ balance: centavos, date: isoDate }).nullable(),
  totals: z.object({ inflow: centavos, outflow: centavos, budgetedSpending: centavos }),
  firstShortfallDate: isoDate.nullable(),
  firstBelowBufferDate: isoDate.nullable(),
  safeToSpend: centavos,
  excludedInflow: z.object({ amount: centavos, count: z.number().int() }),
  assumptions: z.array(z.string()),
});
export type ForecastResultDto = z.infer<typeof forecastResult>;

export const historyPoint = z.object({ date: isoDate, balance: centavos });
export const forecastResponse = z.object({
  history: z.array(historyPoint),
  forecast: forecastResult,
});
export type ForecastResponse = z.infer<typeof forecastResponse>;

export const scenario = z.discriminatedUnion('type', [
  z.object({ type: z.literal('baseline'), label: z.string().optional() }),
  z.object({
    type: z.literal('salary_delayed'),
    days: z.number().int().min(1).max(180),
    eventIds: z.array(uuid).optional(),
    label: z.string().optional(),
  }),
  z.object({
    type: z.literal('income_lost'),
    fromDate: isoDate,
    eventIds: z.array(uuid).optional(),
    label: z.string().optional(),
  }),
  z.object({
    type: z.literal('purchase_added'),
    amount: positiveCentavos,
    date: isoDate,
    name: z.string().max(120).optional(),
    accountId: uuid.nullish(),
    categoryId: uuid.nullish(),
    installments: z.number().int().min(2).max(120).nullish(),
    label: z.string().optional(),
  }),
  z.object({
    type: z.literal('purchase_postponed'),
    eventId: uuid,
    newDate: isoDate,
    label: z.string().optional(),
  }),
  z.object({
    type: z.literal('spending_reduced'),
    percent: z.number().int().min(1).max(100),
    label: z.string().optional(),
  }),
]);
export type ScenarioDto = z.infer<typeof scenario>;

export const scenarioRequest = z.object({
  horizonDays: z.number().int().min(1).max(730).default(90),
  mode: forecastMode.default('expected'),
  scenarios: z.array(scenario).min(1).max(8),
});
export type ScenarioRequest = z.input<typeof scenarioRequest>;
export const scenarioComparison = z.object({
  label: z.string(),
  scenario,
  result: forecastResult,
  delta: z.object({ endingBalance: centavos, lowestBalance: centavos }),
});
export const scenarioResponse = z.object({ comparisons: z.array(scenarioComparison) });
export type ScenarioResponse = z.infer<typeof scenarioResponse>;

export const affordabilityRequest = z.object({
  name: z.string().max(120).optional(),
  amount: positiveCentavos,
  date: isoDate,
  accountId: uuid.nullish(),
  categoryId: uuid.nullish(),
  installments: z.number().int().min(2).max(120).nullish(),
  horizonDays: z.number().int().min(30).max(730).default(120),
});
export type AffordabilityRequest = z.input<typeof affordabilityRequest>;

export const affordabilityResponse = z.object({
  verdict: z.enum([
    'comfortable',
    'tight',
    'compromises_emergency_fund',
    'creates_shortfall',
    'not_affordable_today',
  ]),
  affordableToday: z.boolean(),
  affordableWithoutCompromise: z.boolean(),
  firstPayment: centavos,
  balanceAfterPurchase: centavos,
  lowest: z.object({ balance: centavos, date: isoDate }),
  baselineLowest: z.object({ balance: centavos, date: isoDate }),
  conservativeLowest: z.object({ balance: centavos, date: isoDate }),
  safetyBuffer: centavos,
  bufferHeadroom: centavos,
  emergencyFund: z.object({ reserved: centavos, compromised: z.boolean(), shortfall: centavos }),
  firstShortfallDate: isoDate.nullable(),
  affectedObligations: z.array(
    z.object({ date: isoDate, name: z.string(), amount: centavos, balanceAfter: centavos }),
  ),
  reasons: z.array(z.string()),
  withPurchase: forecastResult,
  baseline: forecastResult,
});
export type AffordabilityResponse = z.infer<typeof affordabilityResponse>;

// ── Dashboard ────────────────────────────────────────────────────────────
export const dashboard = z.object({
  asOf: isoDate,
  position: z.object({ net: centavos, assets: centavos, liabilities: centavos, liquid: centavos }),
  month: z.object({
    key: z.string(),
    income: centavos,
    expenses: centavos,
    refunds: centavos,
    netSpending: centavos,
  }),
  budget: z
    .object({ limit: centavos, spent: centavos, remaining: centavos, dailyAllowance: centavos })
    .nullable(),
  safeToSpend: centavos,
  safetyBuffer: centavos,
  projectedMonthEnd: centavos.nullable(),
  lowest30: z.object({ balance: centavos, date: isoDate }),
  nextIncome: occurrence.nullable(),
  upcoming: z.array(occurrence),
  goals: z.object({ target: centavos, current: centavos, count: z.number().int() }),
  spendingByCategory: z.array(z.object({ categoryId: uuid.nullable(), amount: centavos })),
  health: z.object({
    score: z.number().int().min(0).max(100),
    label: z.enum(['strong', 'stable', 'watch', 'at_risk']),
    factors: z.array(z.object({ label: z.string(), ok: z.boolean() })),
  }),
  alertCounts: z.object({
    critical: z.number().int(),
    warning: z.number().int(),
    info: z.number().int(),
  }),
  isEmpty: z.boolean(),
});
export type Dashboard = z.infer<typeof dashboard>;

// ── Alerts ───────────────────────────────────────────────────────────────
export const alert = z.object({
  id: uuid,
  rule: alertRule,
  severity: alertSeverity,
  fingerprint: z.string(),
  title: z.string(),
  reason: z.string(),
  amount: centavos.nullable(),
  affectedDate: isoDate.nullable(),
  suggestion: z.string(),
  subjectId: z.string().nullable(),
  status: alertStatus,
  firstSeenAt: timestamp,
  lastSeenAt: timestamp,
});
export type Alert = z.infer<typeof alert>;

// ── Sync (mobile offline queue) ─────────────────────────────────────────
export const syncOperation = z.discriminatedUnion('op', [
  z.object({
    opId: uuid,
    entity: z.literal('transaction'),
    op: z.literal(SYNC_OPS[0]),
    data: createTransaction,
    clientUpdatedAt: timestamp,
  }),
  z.object({
    opId: uuid,
    entity: z.literal('transaction'),
    op: z.literal(SYNC_OPS[1]),
    id: uuid,
    data: updateTransaction,
    clientUpdatedAt: timestamp,
    /** The server `updatedAt` the client last saw; used for conflict detection. */
    baseUpdatedAt: timestamp.nullish(),
  }),
  z.object({
    opId: uuid,
    entity: z.literal('transaction'),
    op: z.literal(SYNC_OPS[2]),
    id: uuid,
    clientUpdatedAt: timestamp,
  }),
]);
export type SyncOperation = z.input<typeof syncOperation>;

export const syncPushRequest = z.object({ operations: z.array(syncOperation).min(1).max(200) });
export type SyncPushRequest = z.input<typeof syncPushRequest>;

export const syncOpResult = z.object({
  opId: uuid,
  status: z.enum(['applied', 'duplicate', 'conflict', 'rejected']),
  message: z.string().optional(),
  /** Authoritative server copy after the operation (or the winning version on conflict). */
  transaction: transaction.nullable(),
});
export type SyncOpResult = z.infer<typeof syncOpResult>;
export const syncPushResponse = z.object({ results: z.array(syncOpResult), serverTime: timestamp });
export type SyncPushResponse = z.infer<typeof syncPushResponse>;

export const syncPullQuery = z.object({ since: timestamp.optional() });
export const syncPullResponse = z.object({
  serverTime: timestamp,
  accounts: z.array(account),
  categories: z.array(category),
  transactions: z.array(transaction),
  upcoming: z.array(occurrence),
  settings,
});
export type SyncPullResponse = z.infer<typeof syncPullResponse>;

// ── Health ───────────────────────────────────────────────────────────────
export const health = z.object({
  status: z.enum(['ok', 'degraded']),
  version: z.string(),
  time: timestamp,
});
