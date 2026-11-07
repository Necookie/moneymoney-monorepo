'use client';

import type { OccurrenceDto, ScheduledEvent } from '@mm/api-client';
import { formatDate, formatMoney, formatMonth, parseIsoDate } from '@mm/finance-engine';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Icon } from '@/components/icons/icon';
import { ConfidenceChip, Money } from '@/components/money';
import {
  EmptyState,
  ErrorState,
  PageHeader,
  ProjectionNote,
  SkeletonRows,
} from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge, Segmented, Skeleton } from '@/components/ui/misc';
import { useApi } from '@/lib/api';
import { groupByDate, monthGrid } from '@/lib/calendar';
import {
  describeRecurrence,
  EVENT_KIND_LABEL,
  EVENT_STATUS_LABEL,
  monthRange,
  shiftMonth,
  WEEKDAY_SHORT,
} from '@/lib/format';
import {
  invalidatePlanning,
  useLookups,
  useOccurrences,
  usePlannerEvents,
  useToday,
} from '@/lib/queries';
import { cn } from '@/lib/utils';
import { EventDialogContent, type EventPreset } from './event-dialog';
import { OccurrenceDialogContent } from './occurrence-dialog';

type View = 'month' | 'timeline';
type DirectionFilter = 'all' | 'outflow' | 'inflow';

type EditorState =
  | { kind: 'new'; preset: EventPreset; date?: string }
  | { kind: 'edit'; event: ScheduledEvent }
  | null;

export function CalendarPage() {
  const today = useToday();
  const params = useSearchParams();
  const router = useRouter();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [view, setView] = useState<View>('month');
  const [direction, setDirection] = useState<DirectionFilter>('all');
  const [editor, setEditor] = useState<EditorState>(() => {
    const n = params.get('new');
    if (n === 'income') return { kind: 'new', preset: 'salary' };
    if (n === '1') return { kind: 'new', preset: 'expense' };
    return null;
  });
  const [selected, setSelected] = useState<OccurrenceDto | null>(null);

  const { from, to } = monthRange(month);
  const occurrences = useOccurrences(from, to);
  const events = usePlannerEvents();
  const eventById = useMemo(
    () => new Map((events.data ?? []).map((e) => [e.id, e])),
    [events.data],
  );

  const closeEditor = () => {
    setEditor(null);
    if (params.get('new')) router.replace('/calendar');
  };

  const visible = (occurrences.data ?? []).filter(
    (o) => direction === 'all' || o.direction === direction,
  );
  const pending = (occurrences.data ?? []).filter((o) => !o.settled && !o.skipped);
  const plannedIn = pending.filter((o) => o.direction === 'inflow' && o.confidence !== 'uncertain');
  const uncertainIn = pending.filter(
    (o) => o.direction === 'inflow' && o.confidence === 'uncertain',
  );
  const plannedOut = pending.filter((o) => o.direction === 'outflow');
  const sum = (list: OccurrenceDto[]) => list.reduce((s, o) => s + o.amount, 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Financial Calendar"
        description="Plan future bills, purchases and income. Planned items affect projections only — your actual balance changes when you mark them paid."
        actions={
          <>
            <Button variant="outline" onClick={() => setEditor({ kind: 'new', preset: 'salary' })}>
              <Icon name="inflow" size={16} />
              Add income
            </Button>
            <Button variant="primary" onClick={() => setEditor({ kind: 'new', preset: 'expense' })}>
              <Icon name="plus" size={16} />
              Plan an item
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous month"
            onClick={() => setMonth(shiftMonth(month, -1))}
          >
            <Icon name="chevronLeft" size={16} />
          </Button>
          <h2 className="min-w-32 text-center text-[17px] font-semibold" aria-live="polite">
            {formatMonth(month)}
          </h2>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next month"
            onClick={() => setMonth(shiftMonth(month, 1))}
          >
            <Icon name="chevronRight" size={16} />
          </Button>
          {month !== today.slice(0, 7) ? (
            <Button variant="ghost" size="sm" onClick={() => setMonth(today.slice(0, 7))}>
              Today
            </Button>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            label="Direction"
            size="sm"
            value={direction}
            onChange={setDirection}
            options={[
              { value: 'all', label: 'All' },
              { value: 'outflow', label: 'Money out' },
              { value: 'inflow', label: 'Money in' },
            ]}
          />
          <Segmented
            label="Calendar view"
            size="sm"
            value={view}
            onChange={setView}
            options={[
              { value: 'month', label: 'Month' },
              { value: 'timeline', label: 'Timeline' },
            ]}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryTile
          label="Expected in (confirmed & likely)"
          value={sum(plannedIn)}
          tone="positive"
        />
        <SummaryTile
          label="Uncertain income (not counted as cash)"
          value={sum(uncertainIn)}
          tone="muted"
        />
        <SummaryTile label="Planned out" value={sum(plannedOut)} tone="neutral" />
      </div>

      {occurrences.isError ? (
        <ErrorState error={occurrences.error} onRetry={() => void occurrences.refetch()} />
      ) : occurrences.isPending ? (
        <Skeleton className="h-[560px] rounded-card" />
      ) : view === 'month' ? (
        <MonthView
          month={month}
          today={today}
          occurrences={visible}
          dimmed={occurrences.isPlaceholderData}
          onSelect={setSelected}
          onCreate={(date) => setEditor({ kind: 'new', preset: 'expense', date })}
        />
      ) : (
        <TimelineView
          occurrences={visible}
          today={today}
          dimmed={occurrences.isPlaceholderData}
          onSelect={setSelected}
          onCreate={() => setEditor({ kind: 'new', preset: 'expense' })}
        />
      )}

      <ProjectionNote />

      <PlannedItems
        events={events}
        onEdit={(event) => setEditor({ kind: 'edit', event })}
        onCreate={() => setEditor({ kind: 'new', preset: 'expense' })}
      />

      <Dialog open={editor !== null} onOpenChange={(o) => !o && closeEditor()}>
        {editor ? (
          <EventDialogContent
            key={
              editor.kind === 'edit' ? editor.event.id : `new-${editor.preset}-${editor.date ?? ''}`
            }
            event={editor.kind === 'edit' ? editor.event : null}
            preset={editor.kind === 'new' ? editor.preset : undefined}
            defaultDate={editor.kind === 'new' ? editor.date : undefined}
            onDone={closeEditor}
          />
        ) : null}
      </Dialog>

      <Dialog open={selected !== null} onOpenChange={(o) => !o && setSelected(null)}>
        {selected ? (
          <OccurrenceDialogContent
            key={`${selected.eventId}-${selected.originalDate}`}
            occurrence={selected}
            event={eventById.get(selected.eventId)}
            onDone={() => setSelected(null)}
            onEditSeries={() => {
              const ev = eventById.get(selected.eventId);
              setSelected(null);
              if (ev) setEditor({ kind: 'edit', event: ev });
            }}
          />
        ) : null}
      </Dialog>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'positive' | 'neutral' | 'muted';
}) {
  return (
    <Card className="px-4 py-3">
      <div className="section-label">{label}</div>
      <Money value={value} tone={tone} className="mt-1 block text-[20px] font-semibold" />
    </Card>
  );
}

function OccurrencePill({ o, onSelect }: { o: OccurrenceDto; onSelect: () => void }) {
  const inflow = o.direction === 'inflow';
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      title={`${o.name} · ${inflow ? '+' : '−'}${formatMoney(o.amount)}`}
      className={cn(
        'flex w-full cursor-pointer items-center gap-1 truncate rounded-[5px] px-1.5 py-0.5 text-left text-[11px] leading-4 transition-colors',
        o.skipped
          ? 'text-subtle line-through'
          : o.settled
            ? 'bg-hover text-muted'
            : inflow
              ? o.confidence === 'uncertain'
                ? 'border border-dashed border-positive/40 text-positive/80'
                : 'bg-positive-soft text-positive hover:brightness-95'
              : 'bg-ink/[0.06] text-ink hover:bg-ink/10',
        o.overdue && !o.settled && 'ring-1 ring-negative/50',
      )}
    >
      {o.settled ? <Icon name="check" size={10} /> : null}
      <span className="truncate">{o.name}</span>
      <span className="tabular ml-auto hidden shrink-0 xl:inline">
        {formatMoney(o.amount, { compactZeroCents: true })}
      </span>
    </button>
  );
}

function MonthView({
  month,
  today,
  occurrences,
  dimmed,
  onSelect,
  onCreate,
}: {
  month: string;
  today: string;
  occurrences: OccurrenceDto[];
  dimmed: boolean;
  onSelect: (o: OccurrenceDto) => void;
  onCreate: (date: string) => void;
}) {
  const weeks = monthGrid(month);
  const byDate = useMemo(() => new Map(groupByDate(occurrences, (o) => o.date)), [occurrences]);
  return (
    <Card className={cn('overflow-hidden', dimmed && 'opacity-60')}>
      <div className="grid grid-cols-7 border-b bg-canvas/60">
        {WEEKDAY_SHORT.map((d) => (
          <div key={d} className="section-label px-2 py-2 text-center">
            {d}
          </div>
        ))}
      </div>
      <div role="grid" aria-label={`Calendar for ${formatMonth(month)}`}>
        {weeks.map((week) => (
          <div role="row" key={week[0]!.date} className="grid grid-cols-7 border-b last:border-b-0">
            {week.map((day) => {
              const items = byDate.get(day.date) ?? [];
              const isToday = day.date === today;
              return (
                <div
                  role="gridcell"
                  key={day.date}
                  className={cn(
                    'group relative flex min-h-20 flex-col gap-1 border-r p-1 last:border-r-0 sm:min-h-28 sm:p-1.5',
                    !day.inMonth && 'bg-canvas/50',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        'tabular flex size-6 items-center justify-center rounded-full text-[12px]',
                        isToday
                          ? 'bg-accent font-semibold text-accent-ink'
                          : day.inMonth
                            ? 'text-ink'
                            : 'text-subtle',
                      )}
                    >
                      {parseIsoDate(day.date).day}
                    </span>
                    <button
                      type="button"
                      aria-label={`Plan an item on ${formatDate(day.date)}`}
                      onClick={() => onCreate(day.date)}
                      className="hidden size-5 cursor-pointer items-center justify-center rounded text-muted opacity-0 group-hover:opacity-100 hover:bg-hover focus-visible:opacity-100 sm:flex"
                    >
                      <Icon name="plus" size={12} />
                    </button>
                  </div>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    {items.slice(0, 3).map((o) => (
                      <OccurrencePill
                        key={`${o.eventId}-${o.originalDate}`}
                        o={o}
                        onSelect={() => onSelect(o)}
                      />
                    ))}
                    {items.length > 3 ? (
                      <button
                        type="button"
                        className="cursor-pointer px-1.5 text-left text-[11px] text-muted hover:text-ink"
                        onClick={() => onSelect(items[3]!)}
                      >
                        +{items.length - 3} more
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </Card>
  );
}

function TimelineView({
  occurrences,
  today,
  dimmed,
  onSelect,
  onCreate,
}: {
  occurrences: OccurrenceDto[];
  today: string;
  dimmed: boolean;
  onSelect: (o: OccurrenceDto) => void;
  onCreate: () => void;
}) {
  const { accountName } = useLookups();
  const groups = groupByDate(occurrences, (o) => o.date);
  if (groups.length === 0) {
    return (
      <EmptyState
        icon="calendar"
        title="Nothing planned this month"
        description="Add bills, planned purchases, salary or contract income."
        action={
          <Button variant="primary" size="sm" onClick={onCreate}>
            Plan an item
          </Button>
        }
      />
    );
  }
  return (
    <Card className={cn('p-0', dimmed && 'opacity-60')}>
      <ol className="divide-y">
        {groups.map(([date, items]) => {
          const net = items
            .filter((o) => !o.settled && !o.skipped)
            .reduce((s, o) => s + (o.direction === 'inflow' ? o.amount : -o.amount), 0);
          return (
            <li key={date} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:gap-6">
              <div className="w-36 shrink-0">
                <p className={cn('font-medium', date === today && 'text-ink')}>
                  {formatDate(date)}
                  {date === today ? (
                    <span className="ml-2 rounded-full bg-accent px-1.5 text-[10px] font-semibold">
                      Today
                    </span>
                  ) : null}
                </p>
                {net !== 0 ? (
                  <p className="text-[12px] text-muted">
                    Net <Money value={net} signed className="text-ink-soft" />
                  </p>
                ) : null}
              </div>
              <ul className="flex min-w-0 flex-1 flex-col gap-2">
                {items.map((o) => {
                  const inflow = o.direction === 'inflow';
                  return (
                    <li key={`${o.eventId}-${o.originalDate}`}>
                      <button
                        type="button"
                        onClick={() => onSelect(o)}
                        className="flex w-full cursor-pointer items-center gap-3 rounded-[10px] border px-3 py-2.5 text-left transition-colors hover:bg-canvas/60"
                      >
                        <span
                          className={cn(
                            'flex size-8 shrink-0 items-center justify-center rounded-full',
                            inflow ? 'bg-positive-soft text-positive' : 'bg-hover',
                          )}
                        >
                          <Icon name={inflow ? 'inflow' : 'outflow'} size={14} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span
                            className={cn(
                              'block truncate text-[14px] font-medium',
                              o.skipped && 'text-muted line-through',
                            )}
                          >
                            {o.name}
                            {o.installmentCount ? (
                              <span className="font-normal text-muted">
                                {' '}
                                · {o.index}/{o.installmentCount}
                              </span>
                            ) : null}
                          </span>
                          <span className="flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
                            {EVENT_KIND_LABEL[o.kind]}
                            {o.accountId ? <> · {accountName(o.accountId)}</> : null}
                            {o.settled ? (
                              <Badge tone="positive">{inflow ? 'Received' : 'Paid'}</Badge>
                            ) : null}
                            {o.skipped ? <Badge tone="neutral">Skipped</Badge> : null}
                            {o.overdue && !o.settled ? (
                              <Badge tone="negative">Overdue</Badge>
                            ) : null}
                            {o.rescheduled ? <Badge tone="info">Moved</Badge> : null}
                          </span>
                        </span>
                        <span className="flex flex-col items-end gap-1">
                          <span
                            className={cn(
                              'tabular text-[14px] font-medium',
                              inflow
                                ? o.confidence === 'uncertain'
                                  ? 'text-muted'
                                  : 'text-positive'
                                : 'text-ink',
                              (o.settled || o.skipped) && 'opacity-60',
                            )}
                          >
                            {inflow ? '+' : '−'}
                            {formatMoney(o.amount)}
                          </span>
                          <ConfidenceChip confidence={o.confidence} />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

function PlannedItems({
  events,
  onEdit,
  onCreate,
}: {
  events: ReturnType<typeof usePlannerEvents>;
  onEdit: (e: ScheduledEvent) => void;
  onCreate: () => void;
}) {
  const api = useApi();
  const qc = useQueryClient();
  const { accountName } = useLookups();
  const [showInactive, setShowInactive] = useState(false);
  const [deleting, setDeleting] = useState<ScheduledEvent | null>(null);
  const cancel = useMutation({
    mutationFn: (id: string) => api.planner.cancel(id),
    onSuccess: () => toast.success('Item cancelled'),
    onSettled: () => invalidatePlanning(qc),
  });
  const reactivate = useMutation({
    mutationFn: (e: ScheduledEvent) =>
      api.planner.update(e.id, {
        status: e.recurrence.frequency === 'none' ? 'planned' : 'recurring',
      }),
    onSuccess: () => toast.success('Item re-activated'),
    onSettled: () => invalidatePlanning(qc),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.planner.remove(id),
    onSuccess: () => toast.success('Planned item deleted'),
    onSettled: () => invalidatePlanning(qc),
  });

  const all = events.data ?? [];
  const inactive = all.filter((e) => e.status === 'cancelled' || e.status === 'paid');
  const list = showInactive ? all : all.filter((e) => !inactive.includes(e));
  const income = list.filter((e) => e.direction === 'inflow');
  const outgoing = list.filter((e) => e.direction === 'outflow');

  return (
    <Card>
      <CardHeader
        title="All planned items"
        description="Income sources and planned spending that drive your projections."
        action={
          inactive.length > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => setShowInactive((s) => !s)}>
              {showInactive ? 'Hide' : 'Show'} {inactive.length} paid/cancelled
            </Button>
          ) : null
        }
      />
      <CardContent>
        {events.isError ? (
          <ErrorState error={events.error} onRetry={() => void events.refetch()} compact />
        ) : events.isPending ? (
          <SkeletonRows rows={4} />
        ) : list.length === 0 ? (
          <EmptyState
            icon="calendar"
            title="No planned items yet"
            description="Start with your salary — e.g. “Salary — 15th & 30th” — then add recurring bills."
            action={
              <Button variant="primary" size="sm" onClick={onCreate}>
                Plan an item
              </Button>
            }
          />
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            {[
              { title: 'Income sources', items: income },
              { title: 'Bills & planned spending', items: outgoing },
            ].map((group) => (
              <div key={group.title} className="min-w-0">
                <h3 className="section-label mb-2">{group.title}</h3>
                {group.items.length === 0 ? (
                  <p className="text-sm text-muted">None yet.</p>
                ) : (
                  <ul className="divide-y rounded-[12px] border">
                    {group.items.map((e) => (
                      <li key={e.id} className="flex items-center gap-3 px-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p
                            className={cn(
                              'truncate text-[14px] font-medium',
                              e.status === 'cancelled' && 'text-muted line-through',
                            )}
                          >
                            {e.name}
                          </p>
                          <p className="truncate text-[12px] text-muted">
                            {(e.installments ?? 0) > 1
                              ? `${e.installments} monthly installments from ${formatDate(e.startDate)}`
                              : describeRecurrence(e.recurrence, e.startDate)}
                            {e.accountId ? ` · ${accountName(e.accountId)}` : ''}
                          </p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            <Badge tone="outline">{EVENT_STATUS_LABEL[e.status]}</Badge>
                            <ConfidenceChip confidence={e.confidence} />
                            {e.isDemo ? <Badge tone="warning">Demo</Badge> : null}
                          </div>
                        </div>
                        <div className="text-right">
                          <Money
                            value={e.amount}
                            tone={e.direction === 'inflow' ? 'positive' : 'neutral'}
                            className="text-[14px] font-medium"
                          />
                          {e.amountMin !== null || e.amountMax !== null ? (
                            <p className="tabular text-[11px] text-muted">
                              {e.amountMin !== null
                                ? formatMoney(e.amountMin, { compactZeroCents: true })
                                : '—'}
                              –
                              {e.amountMax !== null
                                ? formatMoney(e.amountMax, { compactZeroCents: true })
                                : '—'}
                            </p>
                          ) : null}
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Actions for ${e.name}`}
                            >
                              <Icon name="more" size={16} />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem onSelect={() => onEdit(e)}>
                              <Icon name="edit" size={14} />
                              Edit
                            </DropdownMenuItem>
                            {e.status === 'cancelled' ? (
                              <DropdownMenuItem onSelect={() => reactivate.mutate(e)}>
                                <Icon name="refresh" size={14} />
                                Re-activate
                              </DropdownMenuItem>
                            ) : e.status !== 'paid' ? (
                              <DropdownMenuItem onSelect={() => cancel.mutate(e.id)}>
                                <Icon name="xCircle" size={14} />
                                Cancel
                              </DropdownMenuItem>
                            ) : null}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem destructive onSelect={() => setDeleting(e)}>
                              <Icon name="trash" size={14} />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete “${deleting?.name ?? ''}”?`}
        description="The planned item and its schedule are removed from projections. Transactions already recorded from it are kept."
        confirmLabel="Delete"
        destructive
        pending={remove.isPending}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id);
          setDeleting(null);
        }}
      />
    </Card>
  );
}
