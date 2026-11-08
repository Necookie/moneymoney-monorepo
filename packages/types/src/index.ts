/**
 * Shared domain vocabulary for Money Money.
 *
 * Conventions:
 * - Money is always an integer number of centavos (`Centavos`). 1 PHP = 100 centavos.
 * - Calendar dates are ISO `YYYY-MM-DD` strings (`IsoDate`) interpreted in the user's timezone
 *   (Asia/Manila by default). Instants are ISO-8601 timestamps (`IsoDateTime`).
 */

/** Integer number of the smallest currency unit (centavos for PHP). Never a float. */
export type Centavos = number;
/** Calendar date, `YYYY-MM-DD`. */
export type IsoDate = string;
/** Instant, ISO-8601 with offset. */
export type IsoDateTime = string;
export type Uuid = string;

export const CURRENCIES = ['PHP'] as const;
export type Currency = (typeof CURRENCIES)[number];
export const DEFAULT_CURRENCY: Currency = 'PHP';
export const DEFAULT_TIMEZONE = 'Asia/Manila';

// ── Accounts ──────────────────────────────────────────────────────────────
export const ACCOUNT_TYPES = ['cash', 'bank', 'ewallet', 'savings', 'credit'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];
/** Liability accounts carry balances owed (a negative contribution to net worth). */
export const LIABILITY_ACCOUNT_TYPES: readonly AccountType[] = ['credit'];

// ── Transactions ──────────────────────────────────────────────────────────
export const TRANSACTION_TYPES = ['income', 'expense', 'transfer', 'refund', 'adjustment'] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

// ── Categories ────────────────────────────────────────────────────────────
export const CATEGORY_KINDS = ['income', 'expense'] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

// ── Scheduled financial events (planned purchases, bills, salary, contracts) ─
export const EVENT_DIRECTIONS = ['inflow', 'outflow'] as const;
export type EventDirection = (typeof EVENT_DIRECTIONS)[number];

export const EVENT_KINDS = [
  'expense',
  'bill',
  'purchase',
  'salary',
  'freelance',
  'contract',
  'income',
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export const EVENT_STATUSES = ['planned', 'committed', 'recurring', 'paid', 'cancelled'] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

/** How sure we are that an event will happen at the stated amount/date. */
export const CONFIDENCE_LEVELS = ['confirmed', 'likely', 'uncertain'] as const;
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

export const RECURRENCE_FREQUENCIES = [
  'none',
  'daily',
  'weekly',
  'biweekly',
  'semimonthly',
  'monthly',
  'quarterly',
  'yearly',
] as const;
export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number];

/**
 * What happens when a monthly anchor day does not exist in a month (e.g. the 31st in April).
 * - `clamp`: use the last day of the shorter month (31 → 30 Apr, 28/29 Feb).
 * - `last_day`: always fall on the last day of every month.
 */
export const MONTH_END_RULES = ['clamp', 'last_day'] as const;
export type MonthEndRule = (typeof MONTH_END_RULES)[number];

export const OCCURRENCE_ACTIONS = ['skip', 'reschedule', 'paid', 'amount'] as const;
export type OccurrenceAction = (typeof OCCURRENCE_ACTIONS)[number];

// ── Forecasting ──────────────────────────────────────────────────────────
export const FORECAST_MODES = ['conservative', 'expected', 'optimistic'] as const;
export type ForecastMode = (typeof FORECAST_MODES)[number];

export const FORECAST_HORIZONS = { '7d': 7, '30d': 30, '90d': 90, '12m': 365 } as const;
export type ForecastHorizon = keyof typeof FORECAST_HORIZONS;

// ── Goals & budgets ──────────────────────────────────────────────────────
export const GOAL_KINDS = [
  'emergency',
  'investment',
  'vehicle',
  'electronics',
  'travel',
  'custom',
] as const;
export type GoalKind = (typeof GOAL_KINDS)[number];

// ── Alerts ───────────────────────────────────────────────────────────────
export const ALERT_SEVERITIES = ['info', 'warning', 'critical'] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

export const ALERT_RULES = [
  'budget_approaching',
  'budget_exceeded',
  'spending_pace',
  'obligations_exceed_funds',
  'below_safety_buffer',
  'purchase_shortfall',
  'uncertain_income_risk',
  'goal_off_track',
] as const;
export type AlertRule = (typeof ALERT_RULES)[number];

export const ALERT_STATUSES = ['active', 'dismissed', 'resolved'] as const;
export type AlertStatus = (typeof ALERT_STATUSES)[number];

// ── Sync ─────────────────────────────────────────────────────────────────
export const SYNC_ENTITIES = ['transaction'] as const;
export type SyncEntity = (typeof SYNC_ENTITIES)[number];
export const SYNC_OPS = ['create', 'update', 'delete'] as const;
export type SyncOp = (typeof SYNC_OPS)[number];

// ── Feature flags ────────────────────────────────────────────────────────
export const APP_FEATURES = [
  'calendar',
  'forecast',
  'budgets',
  'goals',
  'insights',
  'afford',
  'accounts',
] as const;
export type AppFeature = (typeof APP_FEATURES)[number];

export interface AppFeatures {
  calendar: boolean;
  forecast: boolean;
  budgets: boolean;
  goals: boolean;
  insights: boolean;
  afford: boolean;
  accounts: boolean;
}

export const DEFAULT_APP_FEATURES: AppFeatures = {
  calendar: true,
  forecast: true,
  budgets: true,
  goals: true,
  insights: true,
  afford: true,
  accounts: true,
};
