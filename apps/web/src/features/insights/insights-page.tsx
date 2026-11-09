'use client';

import type { Alert, Budget, Dashboard } from '@mm/api-client';
import type { AlertSeverity } from '@mm/types';
import { basisPoints, formatDate, formatMoney, formatMoneyCompact } from '@mm/finance-engine';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  Bar,
  BarChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { toast } from 'sonner';
import { Icon, type IconName } from '@/components/icons/icon';
import { Money } from '@/components/money';
import { FeatureDisabledState } from '@/components/feature-disabled-state';
import { EmptyState, ErrorState, PageHeader, SkeletonRows } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge, Segmented, Skeleton, type BadgeTone } from '@/components/ui/misc';
import { useApi } from '@/lib/api';
import { formatBps, SEVERITY_LABEL } from '@/lib/format';
import {
  invalidateKeys,
  qk,
  useAlerts,
  useBudgets,
  useDashboard,
  useForecast,
  useFeatures,
  useLookups,
} from '@/lib/queries';
import { cn } from '@/lib/utils';

const SEVERITY_TONE: Record<AlertSeverity, BadgeTone> = {
  critical: 'negative',
  warning: 'warning',
  info: 'info',
};
const SEVERITY_ICON: Record<AlertSeverity, IconName> = {
  critical: 'alertCircle',
  warning: 'warning',
  info: 'info',
};
const SEVERITY_ORDER: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };

type AlertView = 'active' | 'dismissed' | 'resolved';

export function InsightsPage() {
  const features = useFeatures();
  if (!features.insights) {
    return (
      <FeatureDisabledState
        featureName="Insights"
        description="Enable Insights in Settings to view automated spending pace alerts and financial health analysis."
      />
    );
  }
  return <InsightsContent />;
}

function InsightsContent() {
  const dashboard = useDashboard();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Insights"
        description="Warnings about overspending and cash flow, where your money goes, and what to watch."
      />
      <AlertsSection />
      {dashboard.isError ? (
        <ErrorState error={dashboard.error} onRetry={() => void dashboard.refetch()} />
      ) : dashboard.isPending ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-80 rounded-card" />
          <Skeleton className="h-80 rounded-card" />
        </div>
      ) : (
        <>
          <InsightCards d={dashboard.data} />
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <SpendingByCategory d={dashboard.data} />
            <HealthFactors d={dashboard.data} />
          </div>
        </>
      )}
    </div>
  );
}

function AlertsSection() {
  const [view, setView] = useState<AlertView>('active');
  const alerts = useAlerts(view);
  const api = useApi();
  const qc = useQueryClient();

  const dismiss = useMutation({
    mutationFn: (id: string) => api.alerts.dismiss(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: qk.alertList('active') });
      const previous = qc.getQueryData<Alert[]>(qk.alertList('active'));
      qc.setQueryData<Alert[]>(qk.alertList('active'), (list) => list?.filter((a) => a.id !== id));
      return { previous };
    },
    onError: (_e, _id, ctx) => qc.setQueryData(qk.alertList('active'), ctx?.previous),
    onSuccess: () => toast.success('Alert dismissed'),
    onSettled: () => invalidateKeys(qc, [qk.alerts, qk.dashboard]),
  });

  const list = [...(alerts.data ?? [])].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );

  return (
    <Card>
      <CardHeader
        title="Alerts"
        description="Re-evaluated from your latest data every time you open this page."
        action={
          <Segmented
            label="Alert status"
            size="sm"
            value={view}
            onChange={setView}
            options={[
              { value: 'active', label: 'Active' },
              { value: 'dismissed', label: 'Dismissed' },
              { value: 'resolved', label: 'Resolved' },
            ]}
          />
        }
      />
      <CardContent>
        {alerts.isError ? (
          <ErrorState error={alerts.error} onRetry={() => void alerts.refetch()} compact />
        ) : alerts.isPending ? (
          <SkeletonRows rows={3} />
        ) : list.length === 0 ? (
          <EmptyState
            icon={view === 'active' ? 'checkCircle' : 'archive'}
            title={view === 'active' ? 'All clear' : `No ${view} alerts`}
            description={
              view === 'active' ? 'No overspending or cash-flow warnings right now.' : undefined
            }
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {list.map((a) => (
              <li
                key={a.id}
                className={cn(
                  'flex flex-col gap-3 rounded-[12px] border p-4 sm:flex-row sm:items-start',
                  a.severity === 'critical' && 'border-negative/30 bg-negative-soft/30',
                  a.severity === 'warning' && 'border-warning/30 bg-warning-soft/30',
                )}
              >
                <Icon
                  name={SEVERITY_ICON[a.severity]}
                  size={20}
                  className={cn(
                    'shrink-0',
                    a.severity === 'critical'
                      ? 'text-negative'
                      : a.severity === 'warning'
                        ? 'text-warning'
                        : 'text-info',
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{a.title}</p>
                    <Badge tone={SEVERITY_TONE[a.severity]}>{SEVERITY_LABEL[a.severity]}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-ink-soft">{a.reason}</p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
                    {a.amount !== null ? (
                      <span>
                        Amount <Money value={a.amount} className="font-medium text-ink" />
                      </span>
                    ) : null}
                    {a.affectedDate ? <span>Affects {formatDate(a.affectedDate)}</span> : null}
                  </div>
                  {a.suggestion ? (
                    <p className="mt-2 flex items-start gap-1.5 text-[13px] text-ink">
                      <Icon name="sparkles" size={14} className="mt-0.5 text-muted" />
                      {a.suggestion}
                    </p>
                  ) : null}
                </div>
                {view === 'active' ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={dismiss.isPending && dismiss.variables === a.id}
                    onClick={() => dismiss.mutate(a.id)}
                  >
                    Dismiss
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

interface Insight {
  key: string;
  icon: IconName;
  text: string;
  figure: number;
  signed?: boolean;
  tone: 'positive' | 'negative' | 'neutral';
  spark?: number[];
}

function InsightCards({ d }: { d: Dashboard }) {
  const { categoryName } = useLookups();
  const budgets = useBudgets(d.month.key);
  const forecast = useForecast({ horizonDays: 30, historyDays: 0, mode: 'expected' });

  const insights: Insight[] = [];
  const net = d.month.income - d.month.netSpending;
  insights.push({
    key: 'net',
    icon: 'trendingUp',
    text:
      net >= 0
        ? 'You have earned more than you spent so far this month'
        : 'You have spent more than you earned so far this month',
    figure: net,
    signed: true,
    tone: net >= 0 ? 'positive' : 'negative',
  });

  const totalSpend = d.spendingByCategory.reduce((s, c) => s + Math.max(0, c.amount), 0);
  const top = [...d.spendingByCategory].sort((a, b) => b.amount - a.amount)[0];
  if (top && totalSpend > 0) {
    insights.push({
      key: 'top',
      icon: 'budgets',
      text: `${categoryName(top.categoryId)} is ${formatBps(basisPoints(top.amount, totalSpend))} of this month's spending`,
      figure: top.amount,
      tone: 'neutral',
    });
  }

  const overPace = (budgets.data ?? [])
    .filter((b: Budget) => b.categoryId && b.status.projectedSpend > b.amount)
    .sort((a, b) => b.status.projectedSpend - b.amount - (a.status.projectedSpend - a.amount))[0];
  if (overPace) {
    const ahead = basisPoints(overPace.status.projectedSpend - overPace.amount, overPace.amount);
    insights.push({
      key: 'pace',
      icon: 'warning',
      text: `${categoryName(overPace.categoryId)} spending is ${formatBps(ahead)} ahead of pace — projected over budget by`,
      figure: overPace.status.projectedSpend - overPace.amount,
      tone: 'negative',
    });
  }

  if (forecast.data) {
    const f = forecast.data.forecast;
    insights.push({
      key: 'runway',
      icon: 'forecast',
      text:
        f.lowest.balance < f.safetyBuffer
          ? `Projected to dip below your safety buffer — lowest on ${formatDate(f.lowest.date, false)}`
          : `Lowest projected balance in the next 30 days (${formatDate(f.lowest.date, false)})`,
      figure: f.lowest.balance,
      tone: f.lowest.balance < f.safetyBuffer ? 'negative' : 'neutral',
      spark: f.points.map((p) => p.balance),
    });
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {insights.map((i) => (
        <Card key={i.key} className="flex flex-col gap-3 p-5">
          <div className="flex items-center justify-between">
            <span className="flex size-8 items-center justify-center rounded-full bg-hover">
              <Icon name={i.icon} size={16} />
            </span>
            {i.spark ? <Sparkline values={i.spark} /> : null}
          </div>
          <p className="flex-1 text-[14px] leading-5 text-ink-soft">{i.text}</p>
          <Money
            value={i.figure}
            signed={i.signed}
            tone={i.tone === 'neutral' ? 'neutral' : i.tone}
            className="text-[20px] font-semibold tracking-tight"
          />
        </Card>
      ))}
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const data = values.map((v, i) => ({ i, v }));
  return (
    <div className="h-8 w-24" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <YAxis hide domain={['dataMin', 'dataMax']} />
          <Line
            dataKey="v"
            stroke="var(--mm-projection)"
            strokeWidth={1.5}
            strokeDasharray="3 2"
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function SpendingByCategory({ d }: { d: Dashboard }) {
  const { categoryName, isLoading } = useLookups();
  const rows = [...d.spendingByCategory]
    .filter((c) => c.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .map((c) => ({
      key: c.categoryId ?? 'none',
      name: categoryName(c.categoryId),
      amount: c.amount,
    }));
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const top = rows.slice(0, 8);
  const rest = rows.slice(8).reduce((s, r) => s + r.amount, 0);
  if (rest > 0) top.push({ key: 'other', name: 'Other', amount: rest });

  return (
    <Card>
      <CardHeader
        title="Spending by category"
        description={`This month · ${formatMoney(total)} net of refunds · transfers excluded`}
      />
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-48 w-full rounded-lg" />
        ) : top.length === 0 ? (
          <EmptyState icon="chartBar" title="No spending recorded this month" />
        ) : (
          <>
            <div style={{ height: Math.max(160, top.length * 40) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={top}
                  layout="vertical"
                  margin={{ top: 0, right: 72, bottom: 0, left: 0 }}
                >
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={120}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: 'var(--mm-ink-soft)', fontSize: 12 }}
                  />
                  <Tooltip
                    cursor={{ fill: 'var(--mm-hover)' }}
                    content={({ active, payload }) => {
                      const row = payload?.[0]?.payload as
                        { name: string; amount: number } | undefined;
                      if (!active || !row) return null;
                      return (
                        <div className="rounded-[10px] border bg-card px-3 py-2 text-[12px] shadow-popover">
                          <p className="font-medium">{row.name}</p>
                          <p className="tabular text-ink-soft">
                            {formatMoney(row.amount)} · {formatBps(basisPoints(row.amount, total))}
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Bar
                    dataKey="amount"
                    fill="var(--mm-ink)"
                    radius={[0, 4, 4, 0]}
                    barSize={18}
                    isAnimationActive={false}
                    label={{
                      position: 'right',
                      fill: 'var(--mm-ink-soft)',
                      fontSize: 12,
                      formatter: (v: unknown) => formatMoneyCompact(Number(v)),
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <table className="sr-only">
              <caption>Spending by category this month</caption>
              <tbody>
                {top.map((r) => (
                  <tr key={r.key}>
                    <th scope="row">{r.name}</th>
                    <td>{formatMoney(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function HealthFactors({ d }: { d: Dashboard }) {
  return (
    <Card>
      <CardHeader title="Health factors" description={`Score ${d.health.score} / 100`} />
      <CardContent>
        <ul className="flex flex-col gap-3">
          {d.health.factors.map((f) => (
            <li key={f.label} className="flex items-start gap-2.5 text-[14px]">
              <Icon
                name={f.ok ? 'checkCircle' : 'alertCircle'}
                size={18}
                className={f.ok ? 'text-positive' : 'text-warning'}
              />
              <span>{f.label}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
