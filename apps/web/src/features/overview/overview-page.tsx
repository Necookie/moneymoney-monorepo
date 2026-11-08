'use client';

import type { Dashboard, OccurrenceDto } from '@mm/api-client';
import { diffDays, formatDate, formatMoney } from '@mm/finance-engine';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { CashFlowChart } from '@/components/charts/cash-flow-chart';
import { Icon } from '@/components/icons/icon';
import { ConfidenceChip, Figure, Money } from '@/components/money';
import { EmptyState, ErrorState, PageHeader, ProjectionNote } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge, ProgressBar, Segmented, Skeleton } from '@/components/ui/misc';
import { useTransactionDialog } from '@/features/transactions/transaction-dialog';
import { useApi } from '@/lib/api';
import { EVENT_KIND_LABEL, formatBps, relativeDay } from '@/lib/format';
import { useDashboard, useMe } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { basisPoints } from '@mm/finance-engine';
import { RANGE_OPTIONS, rangeDays, useCashFlow, type RangeKey } from './use-cash-flow';

const HEALTH_LABEL: Record<Dashboard['health']['label'], string> = {
  strong: 'Strong',
  stable: 'Stable',
  watch: 'Watch',
  at_risk: 'At risk',
};
const HEALTH_TONE = {
  strong: 'positive',
  stable: 'positive',
  watch: 'warning',
  at_risk: 'negative',
} as const;

export function OverviewPage() {
  const dashboard = useDashboard();
  const { openCreate } = useTransactionDialog();

  if (dashboard.isPending) return <OverviewSkeleton />;
  if (dashboard.isError)
    return <ErrorState error={dashboard.error} onRetry={() => void dashboard.refetch()} />;

  const d = dashboard.data;
  if (d.isEmpty) return <FirstRun />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Overview"
        description={`Your actual position and what's coming, as of ${formatDate(d.asOf)}.`}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/calendar?new=1">
                <Icon name="calendar" size={16} />
                Plan an item
              </Link>
            </Button>
            <Button variant="primary" onClick={() => openCreate()} className="lg:hidden">
              <Icon name="plus" size={16} />
              Add transaction
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <PositionCard d={d} />
        <SafeToSpendCard d={d} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="pt-5">
            <Figure label="Income this month" value={d.month.income} tone="neutral" size="md" />
            <div className="mt-3 border-t pt-3">
              <Figure
                label="Spending this month"
                value={d.month.netSpending}
                tone="neutral"
                size="md"
                hint={
                  d.month.refunds > 0
                    ? `${formatMoney(d.month.expenses)} spent − ${formatMoney(d.month.refunds)} refunded`
                    : 'Transfers between your accounts are excluded'
                }
              />
            </div>
          </CardContent>
        </Card>
        <BudgetCard d={d} />
        <Card>
          <CardContent className="pt-5">
            {d.projectedMonthEnd !== null ? (
              <Figure
                label="Projected month-end"
                value={d.projectedMonthEnd}
                size="md"
                hint="Projection — scheduled items and remaining budgets"
              />
            ) : (
              <div>
                <div className="section-label">Projected month-end</div>
                <p className="mt-2 text-sm text-muted">Not available yet.</p>
              </div>
            )}
            <div className="mt-3 border-t pt-3">
              <Figure
                label="Lowest in next 30 days"
                value={d.lowest30.balance}
                size="md"
                hint={`Projected on ${formatDate(d.lowest30.date)}`}
              />
            </div>
          </CardContent>
        </Card>
        <NextIncomeCard d={d} />
      </div>

      <CashFlowCard safetyBuffer={d.safetyBuffer} />

      <div className="grid gap-4 lg:grid-cols-3">
        <UpcomingCard d={d} className="lg:col-span-2" />
        <div className="flex flex-col gap-4">
          <HealthCard d={d} />
          <AlertsSummary d={d} />
          <SavingsCard d={d} />
        </div>
      </div>
    </div>
  );
}

function PositionCard({ d }: { d: Dashboard }) {
  return (
    <section className="rounded-card-lg bg-surface-dark p-5 text-canvas sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="section-label !text-canvas/55">Actual net balance</h2>
        <Badge tone="dark" className="bg-canvas/10 text-canvas/80">
          Actual
        </Badge>
      </div>
      <p
        className={cn(
          'tabular mt-2 text-[36px] leading-[42px] font-semibold tracking-tight sm:text-[44px] sm:leading-[48px]',
          d.position.net < 0 && 'text-[#F87171]',
        )}
      >
        {formatMoney(d.position.net)}
      </p>
      <p className="mt-1 text-[12px] text-canvas/50">
        Recorded transactions only — planned items never change this figure.
      </p>
      <dl className="mt-6 grid grid-cols-3 gap-3 border-t border-canvas/10 pt-4">
        <PositionStat label="Liquid" value={d.position.liquid} />
        <PositionStat label="Assets" value={d.position.assets} />
        <PositionStat label="Owed" value={d.position.liabilities} owed />
      </dl>
    </section>
  );
}

function PositionStat({ label, value, owed }: { label: string; value: number; owed?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold tracking-[0.08em] text-canvas/50 uppercase">
        {label}
      </dt>
      <dd className="tabular mt-1 text-[14px] leading-5 font-medium break-words sm:text-[17px] sm:leading-6">
        {formatMoney(owed ? Math.abs(value) : value)}
      </dd>
    </div>
  );
}

function SafeToSpendCard({ d }: { d: Dashboard }) {
  return (
    <Card className="flex flex-col">
      <CardHeader
        title="Safe to spend"
        description="Based on confirmed income only"
        action={<Icon name="shield" className="text-muted" />}
      />
      <CardContent className="flex flex-1 flex-col justify-between gap-4">
        <p className="tabular text-[32px] leading-[38px] font-semibold tracking-tight">
          {formatMoney(d.safeToSpend)}
        </p>
        <details className="group text-[13px] text-muted">
          <summary className="flex cursor-pointer list-none items-center gap-1 font-medium text-ink-soft">
            <Icon
              name="chevronRight"
              size={14}
              className="transition-transform group-open:rotate-90"
            />
            How is this calculated?
          </summary>
          <p className="mt-2 leading-5">
            The lowest projected balance over the next 30 days in the conservative view, minus your
            safety buffer of{' '}
            <span className="tabular font-medium text-ink">{formatMoney(d.safetyBuffer)}</span>.
            Only confirmed income is counted — likely or uncertain income is excluded, and all
            scheduled bills and remaining budgets are subtracted first.
          </p>
        </details>
      </CardContent>
    </Card>
  );
}

function BudgetCard({ d }: { d: Dashboard }) {
  if (!d.budget) {
    return (
      <Card>
        <CardContent className="pt-5">
          <div className="section-label">Discretionary budget</div>
          <p className="mt-2 text-sm text-muted">
            Set monthly budgets to see what&apos;s left and a daily allowance.
          </p>
          <Button variant="outline" size="sm" asChild className="mt-3">
            <Link href="/budgets">Set a budget</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }
  const used = basisPoints(d.budget.spent, d.budget.limit);
  return (
    <Card>
      <CardContent className="pt-5">
        <Figure
          label="Budget remaining"
          value={d.budget.remaining}
          size="md"
          hint={`${formatMoney(d.budget.spent)} of ${formatMoney(d.budget.limit)} used`}
        />
        <ProgressBar
          className="mt-3"
          label="Budget used"
          value={used / 100}
          tone={used >= 10_000 ? 'negative' : used >= 8_000 ? 'warning' : 'ink'}
        />
        <div className="mt-3 border-t pt-3">
          <Figure
            label="Daily allowance"
            value={d.budget.dailyAllowance}
            size="md"
            tone="neutral"
            hint="Remaining budget ÷ days left this month"
          />
        </div>
      </CardContent>
    </Card>
  );
}

function NextIncomeCard({ d }: { d: Dashboard }) {
  const n = d.nextIncome;
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="section-label">Next expected income</div>
        {n ? (
          <>
            <p className="tabular mt-1 text-[20px] leading-7 font-semibold">
              {formatMoney(n.amount)}
            </p>
            <p className="mt-0.5 truncate text-sm text-ink-soft">{n.name}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-muted">
              <span>
                {formatDate(n.date)} · {relativeDay(diffDays(d.asOf, n.date))}
              </span>
              <ConfidenceChip confidence={n.confidence} />
            </div>
            {n.confidence !== 'confirmed' ? (
              <p className="mt-2 text-[12px] text-muted">
                Not counted as cash until it&apos;s confirmed.
              </p>
            ) : null}
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-muted">No income planned.</p>
            <Button variant="outline" size="sm" asChild className="mt-3">
              <Link href="/calendar?new=income">Add salary or income</Link>
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function CashFlowCard({ safetyBuffer }: { safetyBuffer: number }) {
  const [range, setRange] = useState<RangeKey>('30d');
  const horizon = rangeDays(range);
  const { main, rows, forecast } = useCashFlow(horizon);

  return (
    <Card>
      <CardHeader
        title="Cash flow"
        description="Actual balance history and the projected path ahead"
        action={
          <Segmented
            label="Chart range"
            size="sm"
            value={range}
            onChange={setRange}
            options={RANGE_OPTIONS.map((r) => ({ value: r.value, label: r.label }))}
          />
        }
      />
      <CardContent>
        {main.isError ? (
          <ErrorState error={main.error} onRetry={() => void main.refetch()} compact />
        ) : !rows || !forecast ? (
          <Skeleton className="h-[330px] w-full rounded-lg" />
        ) : (
          <div className={cn('transition-opacity', main.isPlaceholderData && 'opacity-60')}>
            <CashFlowChart rows={rows} today={forecast.asOf} safetyBuffer={safetyBuffer} />
            <div className="mt-4 grid gap-3 border-t pt-4 text-[13px] sm:grid-cols-3">
              <div>
                <span className="text-muted">Projected on {formatDate(forecast.endDate)} </span>
                <Money value={forecast.endingBalance} tone="auto" className="font-medium" />
              </div>
              <div>
                <span className="text-muted">Lowest </span>
                <Money value={forecast.lowest.balance} tone="auto" className="font-medium" />
                <span className="text-muted"> on {formatDate(forecast.lowest.date, false)}</span>
              </div>
              <div>
                {forecast.firstBelowBufferDate ? (
                  <span className="text-warning">
                    Dips below your buffer on {formatDate(forecast.firstBelowBufferDate)}
                  </span>
                ) : (
                  <span className="text-positive">Stays above your safety buffer</span>
                )}
              </div>
            </div>
            {forecast.excludedInflow.count > 0 ? (
              <ProjectionNote className="mt-3">
                {forecast.excludedInflow.count} uncertain income payment(s) (
                {formatMoney(forecast.excludedInflow.amount)}) are not counted in this projection.
              </ProjectionNote>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function UpcomingCard({ d, className }: { d: Dashboard; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader
        title="Upcoming"
        description="Bills, planned purchases and income from your Financial Calendar"
        action={
          <Button variant="ghost" size="sm" asChild>
            <Link href="/calendar">
              Open calendar
              <Icon name="arrowRight" size={14} />
            </Link>
          </Button>
        }
      />
      <CardContent>
        {d.upcoming.length === 0 ? (
          <EmptyState
            icon="calendar"
            title="Nothing scheduled"
            description="Plan bills, purchases and salary so projections can see them coming."
            action={
              <Button variant="outline" size="sm" asChild>
                <Link href="/calendar?new=1">Plan an item</Link>
              </Button>
            }
          />
        ) : (
          <>
            <ul className="divide-y">
              {d.upcoming.map((o) => (
                <UpcomingRow key={`${o.eventId}-${o.originalDate}`} o={o} asOf={d.asOf} />
              ))}
            </ul>
            <ProjectionNote className="mt-3" />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function UpcomingRow({ o, asOf }: { o: OccurrenceDto; asOf: string }) {
  const days = diffDays(asOf, o.date);
  const inflow = o.direction === 'inflow';
  return (
    <li className="flex items-center gap-3 py-3">
      <div
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-full',
          inflow ? 'bg-positive-soft text-positive' : 'bg-hover text-ink-soft',
        )}
      >
        <Icon name={inflow ? 'inflow' : 'outflow'} size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-medium">
          {o.name}
          {o.installmentCount ? (
            <span className="font-normal text-muted">
              {' '}
              · {o.index}/{o.installmentCount}
            </span>
          ) : null}
        </p>
        <p className="flex flex-wrap items-center gap-x-2 text-[12px] text-muted">
          <span>{formatDate(o.date)}</span>
          <span>·</span>
          <span className={cn(o.overdue && 'font-medium text-negative')}>
            {o.overdue ? 'Overdue' : relativeDay(days)}
          </span>
          <span>·</span>
          <span>{EVENT_KIND_LABEL[o.kind]}</span>
        </p>
      </div>
      <div className="flex flex-col items-end gap-1">
        <span
          className={cn(
            'tabular text-[14px] font-medium',
            inflow ? (o.confidence === 'uncertain' ? 'text-muted' : 'text-positive') : 'text-ink',
          )}
        >
          {inflow ? '+' : '−'}
          {formatMoney(o.amount)}
        </span>
        <ConfidenceChip confidence={o.confidence} />
      </div>
    </li>
  );
}

function HealthCard({ d }: { d: Dashboard }) {
  const h = d.health;
  return (
    <Card>
      <CardHeader
        title="Financial health"
        action={<Badge tone={HEALTH_TONE[h.label]}>{HEALTH_LABEL[h.label]}</Badge>}
      />
      <CardContent>
        <div className="flex items-baseline gap-1">
          <span className="tabular text-[32px] leading-none font-semibold">{h.score}</span>
          <span className="text-sm text-muted">/ 100</span>
        </div>
        <ul className="mt-4 space-y-2">
          {h.factors.map((f) => (
            <li key={f.label} className="flex items-start gap-2 text-[13px]">
              <Icon
                name={f.ok ? 'checkCircle' : 'alertCircle'}
                size={16}
                className={cn('mt-0.5', f.ok ? 'text-positive' : 'text-warning')}
              />
              <span className={f.ok ? 'text-ink-soft' : 'text-ink'}>{f.label}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function AlertsSummary({ d }: { d: Dashboard }) {
  const { critical, warning, info } = d.alertCounts;
  const total = critical + warning + info;
  return (
    <Card>
      <CardHeader
        title="Alerts"
        action={
          <Button variant="ghost" size="sm" asChild>
            <Link href="/insights">
              View
              <Icon name="arrowRight" size={14} />
            </Link>
          </Button>
        }
      />
      <CardContent>
        {total === 0 ? (
          <p className="flex items-center gap-2 text-sm text-positive">
            <Icon name="checkCircle" size={16} />
            No active warnings
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {critical > 0 ? <Badge tone="negative">{critical} critical</Badge> : null}
            {warning > 0 ? <Badge tone="warning">{warning} warning</Badge> : null}
            {info > 0 ? <Badge tone="info">{info} info</Badge> : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SavingsCard({ d }: { d: Dashboard }) {
  const g = d.goals;
  if (g.count === 0) {
    return (
      <Card>
        <CardHeader title="Savings goals" />
        <CardContent>
          <p className="text-sm text-muted">Set an emergency fund or savings target.</p>
          <Button variant="outline" size="sm" asChild className="mt-3">
            <Link href="/goals?new=1">Create a goal</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }
  const bps = basisPoints(g.current, g.target);
  return (
    <Card>
      <CardHeader
        title="Savings goals"
        action={
          <Button variant="ghost" size="sm" asChild>
            <Link href="/goals">
              {g.count} goal{g.count === 1 ? '' : 's'}
              <Icon name="arrowRight" size={14} />
            </Link>
          </Button>
        }
      />
      <CardContent>
        <div className="flex items-baseline justify-between gap-2 text-sm">
          <Money value={g.current} className="text-[17px] font-semibold" />
          <span className="text-muted">
            of <Money value={g.target} /> · {formatBps(bps)}
          </span>
        </div>
        <ProgressBar className="mt-3" value={bps / 100} tone="positive" label="Savings progress" />
        <p className="mt-2 text-[12px] text-muted">Allocations are earmarks, not expenses.</p>
      </CardContent>
    </Card>
  );
}

function FirstRun() {
  const api = useApi();
  const qc = useQueryClient();
  const me = useMe();
  const load = useMutation({
    mutationFn: () => api.demo.load(),
    onSuccess: async () => {
      await qc.invalidateQueries();
      toast.success('Demo data loaded', {
        description: 'Remove it any time from the banner or Settings.',
      });
    },
  });
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Welcome to money money."
        description="Know your money before you spend it."
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="flex h-full flex-col gap-3 pt-6">
            <div className="flex size-10 items-center justify-center rounded-full bg-accent">
              <Icon name="wallet" size={20} />
            </div>
            <h2 className="text-[17px] font-semibold">Start with your real accounts</h2>
            <p className="flex-1 text-sm text-muted">
              Add your cash, bank, e-wallet, savings and credit card accounts with today&apos;s
              balances. Then plan bills and salary in the Financial Calendar.
            </p>
            <Button variant="primary" asChild className="self-start">
              <Link href="/accounts?new=1">
                <Icon name="plus" size={16} />
                Add an account
              </Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex h-full flex-col gap-3 pt-6">
            <div className="flex size-10 items-center justify-center rounded-full bg-hover">
              <Icon name="sparkles" size={20} />
            </div>
            <h2 className="text-[17px] font-semibold">Explore with demo data</h2>
            <p className="flex-1 text-sm text-muted">
              Load clearly-labelled sample accounts, transactions and planned items to see how
              forecasts work. A banner stays visible, and you can remove it all in one click.
            </p>
            <Button
              variant="outline"
              className="self-start"
              disabled={load.isPending || me.data?.settings.demoMode}
              onClick={() => load.mutate()}
            >
              {load.isPending ? 'Loading demo data…' : 'Load demo data'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading overview">
      <Skeleton className="h-9 w-48" />
      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <Skeleton className="h-52 rounded-card-lg" />
        <Skeleton className="h-52 rounded-card" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-44 rounded-card" />
        ))}
      </div>
      <Skeleton className="h-[420px] rounded-card" />
    </div>
  );
}
