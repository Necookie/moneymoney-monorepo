import type {
  accounts,
  alerts,
  budgets,
  categories,
  goalAllocations,
  goals,
  occurrenceOverrides,
  scheduledEvents,
  transactions,
  userSettings,
} from '@mm/database';
import type {
  EngineEvent,
  GoalProjection,
  Occurrence,
  OccurrenceOverride,
} from '@mm/finance-engine';
import { DEFAULT_APP_FEATURES, type AppFeatures } from '@mm/types';
import type {
  Account,
  Alert,
  Category,
  Goal,
  GoalAllocation,
  OccurrenceDto,
  OccurrenceOverrideDto,
  ScheduledEvent,
  Settings,
  Transaction,
} from '@mm/validation';

type Row<T extends { $inferSelect: unknown }> = T['$inferSelect'];

const iso = (d: Date) => d.toISOString();
const isoOrNull = (d: Date | null) => (d ? d.toISOString() : null);

export function toSettingsDto(row: Row<typeof userSettings>): Settings {
  return {
    currency: 'PHP',
    timezone: row.timezone,
    safetyBuffer: row.safetyBuffer,
    emergencyFundGoalId: row.emergencyFundGoalId,
    demoMode: row.demoMode,
    features: {
      ...DEFAULT_APP_FEATURES,
      ...((row.features as Partial<AppFeatures> | null) ?? {}),
    },
    updatedAt: iso(row.updatedAt),
  };
}

export function toAccountDto(row: Row<typeof accounts>, balance: number): Account {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    currency: 'PHP',
    openingBalance: row.openingBalance,
    openingDate: row.openingDate,
    balance,
    color: row.color,
    icon: row.icon,
    archived: row.archivedAt !== null,
    isDemo: row.isDemo,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export function toCategoryDto(row: Row<typeof categories>): Category {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    color: row.color,
    icon: row.icon,
    archived: row.archivedAt !== null,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export function toTransactionDto(row: Row<typeof transactions>): Transaction {
  return {
    id: row.id,
    type: row.type,
    amount: row.amount,
    accountId: row.accountId,
    counterAccountId: row.counterAccountId,
    categoryId: row.categoryId,
    occurredOn: row.occurredOn,
    description: row.description,
    notes: row.notes,
    tags: row.tags,
    scheduledEventId: row.scheduledEventId,
    occurrenceDate: row.occurrenceDate,
    isDemo: row.isDemo,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    deletedAt: isoOrNull(row.deletedAt),
  };
}

export function toEventDto(row: Row<typeof scheduledEvents>): ScheduledEvent {
  return {
    id: row.id,
    name: row.name,
    direction: row.direction,
    kind: row.kind,
    status: row.status,
    amount: row.amount,
    amountMin: row.amountMin,
    amountMax: row.amountMax,
    currency: 'PHP',
    confidence: row.confidence,
    accountId: row.accountId,
    categoryId: row.categoryId,
    startDate: row.startDate,
    recurrence: {
      frequency: row.frequency,
      interval: row.interval,
      dayOfMonth: row.dayOfMonth,
      secondDayOfMonth: row.secondDayOfMonth,
      monthEndRule: row.monthEndRule,
      endDate: row.endDate,
      count: row.occurrenceCount,
    },
    installments: row.installments,
    notes: row.notes,
    isDemo: row.isDemo,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export function toEngineEvent(row: Row<typeof scheduledEvents>): EngineEvent {
  return {
    id: row.id,
    name: row.name,
    direction: row.direction,
    kind: row.kind,
    status: row.status,
    amount: row.amount,
    amountMin: row.amountMin,
    amountMax: row.amountMax,
    confidence: row.confidence,
    accountId: row.accountId,
    categoryId: row.categoryId,
    startDate: row.startDate,
    installments: row.installments,
    recurrence: {
      frequency: row.frequency,
      interval: row.interval,
      dayOfMonth: row.dayOfMonth,
      secondDayOfMonth: row.secondDayOfMonth,
      monthEndRule: row.monthEndRule,
      endDate: row.endDate,
      count: row.occurrenceCount,
    },
  };
}

export function toEngineOverride(row: Row<typeof occurrenceOverrides>): OccurrenceOverride {
  return {
    eventId: row.eventId,
    occurrenceDate: row.occurrenceDate,
    action: row.action,
    newDate: row.newDate,
    amount: row.amount,
    transactionId: row.transactionId,
  };
}

export function toOverrideDto(row: Row<typeof occurrenceOverrides>): OccurrenceOverrideDto {
  return {
    id: row.id,
    eventId: row.eventId,
    occurrenceDate: row.occurrenceDate,
    action: row.action,
    newDate: row.newDate,
    amount: row.amount,
    transactionId: row.transactionId,
  };
}

export function toOccurrenceDto(o: Occurrence): OccurrenceDto {
  return {
    eventId: o.eventId,
    name: o.name,
    direction: o.direction,
    kind: o.kind,
    status: o.status,
    confidence: o.confidence,
    accountId: o.accountId,
    categoryId: o.categoryId,
    date: o.date,
    originalDate: o.originalDate,
    amount: o.amount,
    amountMin: o.amountMin,
    amountMax: o.amountMax,
    index: o.index,
    installmentCount: o.installmentCount,
    rescheduled: o.rescheduled,
    overdue: o.overdue,
    settled: o.settled,
    skipped: o.skipped,
    settledTransactionId: o.settledTransactionId,
  };
}

export function toGoalDto(
  row: Row<typeof goals>,
  currentAmount: number,
  projection: GoalProjection,
): Goal {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    targetAmount: row.targetAmount,
    currentAmount,
    targetDate: row.targetDate,
    monthlyContribution: row.monthlyContribution,
    accountId: row.accountId,
    archived: row.archivedAt !== null,
    isDemo: row.isDemo,
    projection: {
      remaining: projection.remaining,
      progressBps: projection.progressBps,
      complete: projection.complete,
      monthsToComplete: projection.monthsToComplete,
      estimatedCompletionDate: projection.estimatedCompletionDate,
      requiredMonthlyContribution: projection.requiredMonthlyContribution,
      onTrack: projection.onTrack,
    },
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export function toAllocationDto(row: Row<typeof goalAllocations>): GoalAllocation {
  return {
    id: row.id,
    goalId: row.goalId,
    amount: row.amount,
    allocatedOn: row.allocatedOn,
    note: row.note,
    createdAt: iso(row.createdAt),
  };
}

export function toAlertDto(row: Row<typeof alerts>): Alert {
  return {
    id: row.id,
    rule: row.rule,
    severity: row.severity,
    fingerprint: row.fingerprint,
    title: row.title,
    reason: row.reason,
    amount: row.amount,
    affectedDate: row.affectedDate,
    suggestion: row.suggestion,
    subjectId: row.subjectId,
    status: row.status,
    firstSeenAt: iso(row.firstSeenAt),
    lastSeenAt: iso(row.lastSeenAt),
  };
}

export type BudgetRow = Row<typeof budgets>;
