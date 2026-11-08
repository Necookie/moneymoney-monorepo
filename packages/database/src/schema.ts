import {
  ACCOUNT_TYPES,
  ALERT_RULES,
  ALERT_SEVERITIES,
  ALERT_STATUSES,
  CATEGORY_KINDS,
  CONFIDENCE_LEVELS,
  DEFAULT_APP_FEATURES,
  type AppFeatures,
  EVENT_DIRECTIONS,
  EVENT_KINDS,
  EVENT_STATUSES,
  GOAL_KINDS,
  MONTH_END_RULES,
  OCCURRENCE_ACTIONS,
  RECURRENCE_FREQUENCIES,
  SYNC_OPS,
  TRANSACTION_TYPES,
} from '@mm/types';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Money Money schema.
 *
 * - Money: BIGINT centavos (mode "number"; the app keeps values within Number.MAX_SAFE_INTEGER).
 * - Calendar dates: DATE as `YYYY-MM-DD` strings (user timezone). Instants: TIMESTAMPTZ.
 * - Ownership: every row carries `user_id`. Child rows reference parents through composite
 *   (id, user_id) foreign keys, so a record can never point at another user's account/category.
 */

export const accountType = pgEnum('account_type', ACCOUNT_TYPES);
export const transactionType = pgEnum('transaction_type', TRANSACTION_TYPES);
export const categoryKind = pgEnum('category_kind', CATEGORY_KINDS);
export const eventDirection = pgEnum('event_direction', EVENT_DIRECTIONS);
export const eventKind = pgEnum('event_kind', EVENT_KINDS);
export const eventStatus = pgEnum('event_status', EVENT_STATUSES);
export const confidenceLevel = pgEnum('confidence_level', CONFIDENCE_LEVELS);
export const recurrenceFrequency = pgEnum('recurrence_frequency', RECURRENCE_FREQUENCIES);
export const monthEndRule = pgEnum('month_end_rule', MONTH_END_RULES);
export const occurrenceAction = pgEnum('occurrence_action', OCCURRENCE_ACTIONS);
export const goalKind = pgEnum('goal_kind', GOAL_KINDS);
export const alertRule = pgEnum('alert_rule', ALERT_RULES);
export const alertSeverity = pgEnum('alert_severity', ALERT_SEVERITIES);
export const alertStatus = pgEnum('alert_status', ALERT_STATUSES);
export const syncOp = pgEnum('sync_op', SYNC_OPS);

const money = (name: string) => bigint(name, { mode: 'number' });
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

// ── Users & settings ─────────────────────────────────────────────────────
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  clerkUserId: text('clerk_user_id').notNull().unique(),
  email: text('email'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const userSettings = pgTable(
  'user_settings',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    currency: text('currency').notNull().default('PHP'),
    timezone: text('timezone').notNull().default('Asia/Manila'),
    safetyBuffer: money('safety_buffer').notNull().default(0),
    emergencyFundGoalId: uuid('emergency_fund_goal_id'),
    demoMode: boolean('demo_mode').notNull().default(false),
    features: jsonb('features').$type<AppFeatures>().notNull().default(DEFAULT_APP_FEATURES),
    updatedAt: updatedAt(),
  },
  (t) => [check('safety_buffer_non_negative', sql`${t.safetyBuffer} >= 0`)],
);

// ── Accounts ─────────────────────────────────────────────────────────────
export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: accountType('type').notNull(),
    currency: text('currency').notNull().default('PHP'),
    openingBalance: money('opening_balance').notNull().default(0),
    openingDate: date('opening_date', { mode: 'string' }).notNull(),
    color: text('color'),
    icon: text('icon'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    isDemo: boolean('is_demo').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('accounts_id_user_unique').on(t.id, t.userId),
    index('accounts_user_idx').on(t.userId),
  ],
);

// ── Categories ───────────────────────────────────────────────────────────
export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    kind: categoryKind('kind').notNull(),
    color: text('color'),
    icon: text('icon'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('categories_id_user_unique').on(t.id, t.userId),
    uniqueIndex('categories_user_kind_name_unique').on(t.userId, t.kind, sql`lower(${t.name})`),
  ],
);

// ── Scheduled financial events ───────────────────────────────────────────
export const scheduledEvents = pgTable(
  'scheduled_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    direction: eventDirection('direction').notNull(),
    kind: eventKind('kind').notNull(),
    status: eventStatus('status').notNull().default('planned'),
    amount: money('amount').notNull(),
    amountMin: money('amount_min'),
    amountMax: money('amount_max'),
    currency: text('currency').notNull().default('PHP'),
    confidence: confidenceLevel('confidence').notNull().default('confirmed'),
    accountId: uuid('account_id'),
    categoryId: uuid('category_id'),
    startDate: date('start_date', { mode: 'string' }).notNull(),
    // Recurrence rule (1:1 with the event, stored inline — see docs/decisions/0004).
    frequency: recurrenceFrequency('frequency').notNull().default('none'),
    interval: integer('interval').notNull().default(1),
    dayOfMonth: integer('day_of_month'),
    secondDayOfMonth: integer('second_day_of_month'),
    monthEndRule: monthEndRule('month_end_rule').notNull().default('clamp'),
    endDate: date('end_date', { mode: 'string' }),
    occurrenceCount: integer('occurrence_count'),
    installments: integer('installments'),
    notes: text('notes'),
    isDemo: boolean('is_demo').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('scheduled_events_id_user_unique').on(t.id, t.userId),
    index('scheduled_events_user_start_idx').on(t.userId, t.startDate),
    foreignKey({
      name: 'scheduled_events_account_fk',
      columns: [t.accountId, t.userId],
      foreignColumns: [accounts.id, accounts.userId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'scheduled_events_category_fk',
      columns: [t.categoryId, t.userId],
      foreignColumns: [categories.id, categories.userId],
    }).onDelete('restrict'),
    check('scheduled_events_amount_positive', sql`${t.amount} > 0`),
    check(
      'scheduled_events_range_valid',
      sql`(${t.amountMin} IS NULL OR ${t.amountMin} <= ${t.amount}) AND (${t.amountMax} IS NULL OR ${t.amountMax} >= ${t.amount})`,
    ),
    check('scheduled_events_interval_positive', sql`${t.interval} >= 1`),
    check(
      'scheduled_events_installments_valid',
      sql`${t.installments} IS NULL OR ${t.installments} >= 2`,
    ),
    check(
      'scheduled_events_end_after_start',
      sql`${t.endDate} IS NULL OR ${t.endDate} >= ${t.startDate}`,
    ),
  ],
);

// ── Transactions ─────────────────────────────────────────────────────────
export const transactions = pgTable(
  'transactions',
  {
    /** Client-generated UUID — the idempotency key for creates and offline sync. */
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: transactionType('type').notNull(),
    amount: money('amount').notNull(),
    accountId: uuid('account_id').notNull(),
    counterAccountId: uuid('counter_account_id'),
    categoryId: uuid('category_id'),
    occurredOn: date('occurred_on', { mode: 'string' }).notNull(),
    description: text('description').notNull().default(''),
    notes: text('notes'),
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    scheduledEventId: uuid('scheduled_event_id'),
    occurrenceDate: date('occurrence_date', { mode: 'string' }),
    isDemo: boolean('is_demo').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('transactions_user_date_idx').on(t.userId, t.occurredOn),
    index('transactions_user_updated_idx').on(t.userId, t.updatedAt),
    index('transactions_account_idx').on(t.accountId),
    index('transactions_category_idx').on(t.categoryId),
    // A planned occurrence can only be realised by one live transaction (prevents double counting).
    uniqueIndex('transactions_event_occurrence_unique')
      .on(t.scheduledEventId, t.occurrenceDate)
      .where(sql`${t.scheduledEventId} IS NOT NULL AND ${t.deletedAt} IS NULL`),
    foreignKey({
      name: 'transactions_account_fk',
      columns: [t.accountId, t.userId],
      foreignColumns: [accounts.id, accounts.userId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'transactions_counter_account_fk',
      columns: [t.counterAccountId, t.userId],
      foreignColumns: [accounts.id, accounts.userId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'transactions_category_fk',
      columns: [t.categoryId, t.userId],
      foreignColumns: [categories.id, categories.userId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'transactions_event_fk',
      columns: [t.scheduledEventId, t.userId],
      foreignColumns: [scheduledEvents.id, scheduledEvents.userId],
    }), // NO ACTION: the API detaches transactions before deleting an event (composite SET NULL would null user_id)
    check(
      'transactions_amount_sign',
      sql`(${t.type} = 'adjustment' AND ${t.amount} <> 0) OR (${t.type} <> 'adjustment' AND ${t.amount} > 0)`,
    ),
    check(
      'transactions_transfer_shape',
      sql`(${t.type} = 'transfer' AND ${t.counterAccountId} IS NOT NULL AND ${t.counterAccountId} <> ${t.accountId}) OR (${t.type} <> 'transfer' AND ${t.counterAccountId} IS NULL)`,
    ),
  ],
);

/** Per-occurrence adjustments to recurring/planned events (skip, reschedule, paid, amount). */
export const occurrenceOverrides = pgTable(
  'occurrence_overrides',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id').notNull(),
    occurrenceDate: date('occurrence_date', { mode: 'string' }).notNull(),
    action: occurrenceAction('action').notNull(),
    newDate: date('new_date', { mode: 'string' }),
    amount: money('amount'),
    transactionId: uuid('transaction_id').references(() => transactions.id, {
      onDelete: 'set null',
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('occurrence_overrides_event_date_unique').on(t.eventId, t.occurrenceDate),
    foreignKey({
      name: 'occurrence_overrides_event_fk',
      columns: [t.eventId, t.userId],
      foreignColumns: [scheduledEvents.id, scheduledEvents.userId],
    }).onDelete('cascade'),
    check(
      'occurrence_overrides_reschedule_has_date',
      sql`${t.action} <> 'reschedule' OR ${t.newDate} IS NOT NULL`,
    ),
    check(
      'occurrence_overrides_amount_has_amount',
      sql`${t.action} <> 'amount' OR ${t.amount} IS NOT NULL`,
    ),
  ],
);

// ── Budgets ──────────────────────────────────────────────────────────────
export const budgets = pgTable(
  'budgets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** NULL = overall monthly spending limit. */
    categoryId: uuid('category_id'),
    amount: money('amount').notNull(),
    isDemo: boolean('is_demo').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('budgets_user_category_unique')
      .on(t.userId, t.categoryId)
      .where(sql`${t.categoryId} IS NOT NULL`),
    uniqueIndex('budgets_user_overall_unique')
      .on(t.userId)
      .where(sql`${t.categoryId} IS NULL`),
    foreignKey({
      name: 'budgets_category_fk',
      columns: [t.categoryId, t.userId],
      foreignColumns: [categories.id, categories.userId],
    }).onDelete('cascade'),
    check('budgets_amount_positive', sql`${t.amount} > 0`),
  ],
);

// ── Goals ────────────────────────────────────────────────────────────────
export const goals = pgTable(
  'goals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    kind: goalKind('kind').notNull(),
    targetAmount: money('target_amount').notNull(),
    targetDate: date('target_date', { mode: 'string' }),
    monthlyContribution: money('monthly_contribution'),
    accountId: uuid('account_id'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    isDemo: boolean('is_demo').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('goals_id_user_unique').on(t.id, t.userId),
    foreignKey({
      name: 'goals_account_fk',
      columns: [t.accountId, t.userId],
      foreignColumns: [accounts.id, accounts.userId],
    }), // NO ACTION: accounts are archived, not deleted, while referenced
    check('goals_target_positive', sql`${t.targetAmount} > 0`),
  ],
);

export const goalAllocations = pgTable(
  'goal_allocations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    goalId: uuid('goal_id').notNull(),
    amount: money('amount').notNull(),
    allocatedOn: date('allocated_on', { mode: 'string' }).notNull(),
    note: text('note'),
    createdAt: createdAt(),
  },
  (t) => [
    index('goal_allocations_goal_idx').on(t.goalId),
    foreignKey({
      name: 'goal_allocations_goal_fk',
      columns: [t.goalId, t.userId],
      foreignColumns: [goals.id, goals.userId],
    }).onDelete('cascade'),
    check('goal_allocations_amount_nonzero', sql`${t.amount} <> 0`),
  ],
);

// ── Alerts ───────────────────────────────────────────────────────────────
export const alerts = pgTable(
  'alerts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    rule: alertRule('rule').notNull(),
    severity: alertSeverity('severity').notNull(),
    fingerprint: text('fingerprint').notNull(),
    title: text('title').notNull(),
    reason: text('reason').notNull(),
    amount: money('amount'),
    affectedDate: date('affected_date', { mode: 'string' }),
    suggestion: text('suggestion').notNull(),
    subjectId: text('subject_id'),
    status: alertStatus('status').notNull().default('active'),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    notifiedAt: timestamp('notified_at', { withTimezone: true }),
  },
  (t) => [
    unique('alerts_user_fingerprint_unique').on(t.userId, t.fingerprint),
    index('alerts_user_status_idx').on(t.userId, t.status),
  ],
);

// ── Sync operations (idempotency log for offline clients) ───────────────
export const syncOperations = pgTable(
  'sync_operations',
  {
    /** Client-generated operation id. Replaying the same op returns the stored result. */
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    entity: text('entity').notNull(),
    entityId: uuid('entity_id').notNull(),
    op: syncOp('op').notNull(),
    status: text('status').notNull(),
    result: jsonb('result'),
    createdAt: createdAt(),
  },
  (t) => [index('sync_operations_user_created_idx').on(t.userId, t.createdAt)],
);

export const schema = {
  users,
  userSettings,
  accounts,
  categories,
  scheduledEvents,
  transactions,
  occurrenceOverrides,
  budgets,
  goals,
  goalAllocations,
  alerts,
  syncOperations,
};
