'use client';

import type { ForecastResultDto } from '@mm/api-client';
import type { ForecastMode } from '@mm/types';
import { formatDate, formatMoney } from '@mm/finance-engine';
import { useState } from 'react';
import { CashFlowChart } from '@/components/charts/cash-flow-chart';
import { Icon } from '@/components/icons/icon';
import { Figure, Money } from '@/components/money';
import { FeatureDisabledState } from '@/components/feature-disabled-state';
import { ErrorState, PageHeader } from '@/components/states';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge, Segmented, Skeleton, Switch } from '@/components/ui/misc';
import { useMe } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { useCashFlow } from '@/features/overview/use-cash-flow';
import { AffordabilityCard } from './affordability';
import { ScenarioCard } from './scenarios';

const HORIZONS = [
  { value: '30', label: '30 days' },
  { value: '60', label: '60 days' },
  { value: '90', label: '90 days' },
  { value: '180', label: '6 months' },
  { value: '365', label: '12 months' },
] as const;
type HorizonKey = (typeof HORIZONS)[number]['value'];

const MODE_HELP: Record<ForecastMode, string> = {
  conservative:
    'Only confirmed income, at its lowest amount; every expense at its highest. The safest view.',
  expected: 'Confirmed and likely income at expected amounts; uncertain income is excluded.',
  optimistic:
    'All income including uncertain payments at their highest; expenses at their lowest, uncertain ones excluded.',
};

export function ForecastPage() {
  const [horizon, setHorizon] = useState<HorizonKey>('90');
  const [mode, setMode] = useState<ForecastMode>('expected');
  const [includeBudgets, setIncludeBudgets] = useState(true);
  const me = useMe();
  const horizonDays = Number(horizon);
  const { main, rows, forecast } = useCashFlow(horizonDays, {
    mode,
    historyDays: 30,
    includeBudgetedSpending: includeBudgets,
  });
  const safetyBuffer = forecast?.safetyBuffer ?? me.data?.settings.safetyBuffer ?? 0;

  if (me.data?.settings.features.forecast === false) {
    return (
      <FeatureDisabledState
        featureName="Forecast"
        description="Enable Cash Flow Forecast in Settings to explore daily projections and scenarios."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Forecast"
        description="Where your balance is heading, why, and what-if simulations. Simulations never save anything."
      />

      <Card className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            label="Horizon"
            size="sm"
            value={horizon}
            onChange={setHorizon}
            options={HORIZONS}
          />
          <Segmented
            label="Forecast mode"
            size="sm"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'conservative', label: 'Conservative' },
              { value: 'expected', label: 'Expected' },
              { value: 'optimistic', label: 'Optimistic' },
            ]}
          />
        </div>
        <label className="flex items-center gap-2 text-[13px] text-ink-soft">
          <Switch checked={includeBudgets} onCheckedChange={setIncludeBudgets} />
          Include day-to-day budgeted spending
        </label>
      </Card>
      <p className="-mt-3 text-[13px] text-muted">{MODE_HELP[mode]}</p>

      {main.isError ? (
        <ErrorState error={main.error} onRetry={() => void main.refetch()} />
      ) : !forecast || !rows ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-28 rounded-card" />
            ))}
          </div>
          <Skeleton className="h-[420px] rounded-card" />
        </>
      ) : (
        <div className={cn('flex flex-col gap-6', main.isPlaceholderData && 'opacity-70')}>
          <KeyFigures f={forecast} />
          <Card>
            <CardHeader
              title="Projected balance"
              description={`Last 30 days actual · next ${HORIZONS.find((h) => h.value === horizon)?.label} projected (${mode})`}
            />
            <CardContent>
              <CashFlowChart
                rows={rows}
                today={forecast.asOf}
                safetyBuffer={safetyBuffer}
                height={340}
              />
            </CardContent>
          </Card>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <Assumptions f={forecast} />
            <DayByDay f={forecast} />
          </div>
        </div>
      )}

      {me.data?.settings.features.afford !== false ? <AffordabilityCard /> : null}
      <ScenarioCard horizonDays={horizonDays} mode={mode} />
    </div>
  );
}

function KeyFigures({ f }: { f: ForecastResultDto }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card className="p-5">
        <Figure
          label={`Ending · ${formatDate(f.endDate, false)}`}
          value={f.endingBalance}
          size="md"
          hint="Projection"
        />
      </Card>
      <Card className="p-5">
        <Figure
          label="Lowest balance"
          value={f.lowest.balance}
          size="md"
          hint={`On ${formatDate(f.lowest.date)}`}
        />
      </Card>
      <Card className="p-5">
        {f.monthEnd ? (
          <Figure
            label="This month-end"
            value={f.monthEnd.balance}
            size="md"
            hint={formatDate(f.monthEnd.date)}
          />
        ) : (
          <Figure
            label="Safe to spend"
            value={f.safeToSpend}
            size="md"
            hint="Lowest balance minus buffer"
          />
        )}
      </Card>
      <Card className="flex flex-col gap-2 p-5">
        <div className="section-label">Risk dates</div>
        {f.firstShortfallDate ? (
          <p className="flex items-center gap-1.5 text-sm text-negative">
            <Icon name="alertCircle" size={16} />
            Below zero on {formatDate(f.firstShortfallDate)}
          </p>
        ) : (
          <p className="flex items-center gap-1.5 text-sm text-positive">
            <Icon name="checkCircle" size={16} />
            Never below zero
          </p>
        )}
        {f.firstBelowBufferDate ? (
          <p className="flex items-center gap-1.5 text-sm text-warning">
            <Icon name="warning" size={16} />
            Below buffer on {formatDate(f.firstBelowBufferDate)}
          </p>
        ) : (
          <p className="flex items-center gap-1.5 text-sm text-positive">
            <Icon name="checkCircle" size={16} />
            Stays above the {formatMoney(f.safetyBuffer)} buffer
          </p>
        )}
        {f.excludedInflow.count > 0 ? (
          <p className="text-[12px] text-muted">
            {f.excludedInflow.count} uncertain income ({formatMoney(f.excludedInflow.amount)})
            excluded
          </p>
        ) : null}
      </Card>
    </div>
  );
}

function Assumptions({ f }: { f: ForecastResultDto }) {
  return (
    <Card>
      <CardHeader title="How this is calculated" />
      <CardContent>
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-[14px] text-ink-soft marker:text-muted">
          {f.assumptions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ol>
        <dl className="mt-5 grid grid-cols-3 gap-3 border-t pt-4 text-[13px]">
          <div>
            <dt className="text-muted">Starting (actual)</dt>
            <dd>
              <Money value={f.startingBalance} tone="auto" className="font-medium" />
            </dd>
          </div>
          <div>
            <dt className="text-muted">Planned in</dt>
            <dd>
              <Money value={f.totals.inflow} tone="positive" className="font-medium" />
            </dd>
          </div>
          <div>
            <dt className="text-muted">Planned out + budgets</dt>
            <dd>
              <Money value={f.totals.outflow + f.totals.budgetedSpending} className="font-medium" />
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

function DayByDay({ f }: { f: ForecastResultDto }) {
  const [showAll, setShowAll] = useState(false);
  const days = showAll ? f.points : f.points.filter((p) => p.items.length > 0);
  return (
    <Card className="flex flex-col">
      <CardHeader
        title="Day by day"
        description={showAll ? 'Every projected day' : 'Days with scheduled items'}
        action={
          <label className="flex items-center gap-2 text-[12px] text-muted">
            <Switch checked={showAll} onCheckedChange={setShowAll} />
            All days
          </label>
        }
      />
      <CardContent className="pt-3">
        {days.length === 0 ? (
          <p className="text-sm text-muted">No scheduled items in this horizon.</p>
        ) : (
          <div className="max-h-[440px] overflow-auto rounded-[10px] border">
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 bg-canvas text-left">
                <tr>
                  <th className="px-3 py-2 font-medium text-muted">Date</th>
                  <th className="px-3 py-2 font-medium text-muted">Items</th>
                  <th className="px-3 py-2 text-right font-medium text-muted">Budgeted</th>
                  <th className="px-3 py-2 text-right font-medium text-muted">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {days.map((p) => (
                  <tr
                    key={p.date}
                    className={cn(p.balance < f.safetyBuffer && 'bg-warning-soft/40')}
                  >
                    <td className="tabular px-3 py-2 align-top whitespace-nowrap">
                      {formatDate(p.date, false)}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {p.items.length === 0 ? (
                        <span className="text-subtle">—</span>
                      ) : (
                        <ul className="space-y-0.5">
                          {p.items.map((i, idx) => (
                            <li
                              key={`${i.eventId}-${idx}`}
                              className="flex flex-wrap items-center gap-1.5"
                            >
                              <span
                                className={i.direction === 'inflow' ? 'text-positive' : 'text-ink'}
                              >
                                {i.direction === 'inflow' ? '+' : '−'}
                                <span className="tabular">{formatMoney(Math.abs(i.amount))}</span>
                              </span>
                              <span className="text-ink-soft">{i.name}</span>
                              {i.installment ? (
                                <span className="text-muted">
                                  ({i.installment.index}/{i.installment.count})
                                </span>
                              ) : null}
                              {i.confidence !== 'confirmed' ? (
                                <Badge
                                  tone={i.confidence === 'likely' ? 'info' : 'outline'}
                                  className="py-0"
                                >
                                  {i.confidence}
                                </Badge>
                              ) : null}
                              {i.overdue ? (
                                <Badge tone="negative" className="py-0">
                                  overdue
                                </Badge>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="tabular px-3 py-2 text-right align-top text-muted">
                      {p.budgetedSpending > 0 ? `−${formatMoney(p.budgetedSpending)}` : '—'}
                    </td>
                    <td
                      className={cn(
                        'tabular px-3 py-2 text-right align-top font-medium',
                        p.balance < 0 && 'text-negative',
                      )}
                    >
                      {formatMoney(p.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
