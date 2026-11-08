import { FORECAST_HORIZONS, type ForecastHorizon } from '@mm/types';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { CashFlowChart } from '@/components/CashFlowChart';
import { ConfidenceChip } from '@/components/finance';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { SyncIndicator } from '@/components/SyncIndicator';
import { UpdateBanner } from '@/components/UpdateBanner';
import {
  Banner,
  Button,
  Card,
  Divider,
  ErrorCard,
  Label,
  Money,
  ProgressBar,
  Row,
  Segmented,
  Skeleton,
  Text,
} from '@/components/ui';
import { useCachedQuery } from '@/hooks/useCachedQuery';
import { useLocalAccounts, useLocalSettings } from '@/hooks/useLocalData';
import { errorMessage, getApi } from '@/lib/api';
import { formatDate, formatMoney, relativeDay, timeAgo, today } from '@/lib/format';
import { syncNow } from '@/lib/sync/runtime';
import { colors } from '@/lib/theme';

const RANGES = (Object.keys(FORECAST_HORIZONS) as ForecastHorizon[]).map((k) => ({
  value: k,
  label: k,
}));

const HEALTH_LABEL = {
  strong: 'Strong',
  stable: 'Stable',
  watch: 'Watch',
  at_risk: 'At risk',
} as const;

export default function HomeScreen() {
  const api = getApi();
  const [range, setRange] = useState<ForecastHorizon>('30d');
  const dashboard = useCachedQuery(['dashboard'], () => api.dashboard());
  const horizon = FORECAST_HORIZONS[range];
  const forecast = useCachedQuery(['forecast', 'home', range], () =>
    api.forecast.get({
      horizonDays: horizon,
      historyDays: Math.min(horizon, 365),
      mode: 'expected',
    }),
  );
  const local = useLocalAccounts();
  const settings = useLocalSettings();
  const [refreshing, setRefreshing] = useState(false);

  const features = settings.data?.features;
  const showBudgets = features?.budgets !== false;
  const showCalendar = features?.calendar !== false;
  const showForecast = features?.forecast !== false;
  const showInsights = features?.insights !== false;

  const refresh = async () => {
    setRefreshing(true);
    try {
      await syncNow({ force: true });
      await Promise.all([dashboard.refetch(), forecast.refetch()]);
    } finally {
      setRefreshing(false);
    }
  };

  const d = dashboard.data?.data;
  const unsynced = local.data?.unsyncedCount ?? 0;
  // With unsynced local changes, the local figure (server balances + pending deltas) is the
  // honest "actual" number; otherwise use the server's.
  const actualBalance =
    unsynced > 0 && local.data ? local.data.net : (d?.position.net ?? local.data?.net);
  const t = today();

  return (
    <Screen title="Overview" right={<SyncIndicator />} refreshing={refreshing} onRefresh={refresh}>
      <UpdateBanner />
      {dashboard.data?.fromCache ? (
        <Banner
          tone="neutral"
          icon="offline"
          title={`Offline — showing figures from ${timeAgo(new Date(dashboard.data.fetchedAt).toISOString())}`}
          body="Balances below include changes made on this phone that haven't synced yet."
        />
      ) : null}

      {dashboard.isError && !d ? (
        <ErrorCard message={errorMessage(dashboard.error)} onRetry={() => dashboard.refetch()} />
      ) : null}

      {/* Hero: actual vs safe to spend */}
      <Card dark className="gap-4">
        <View className="gap-1">
          <Label className="text-subtle">Actual balance</Label>
          {actualBalance === undefined ? (
            <Skeleton className="h-10 w-48 bg-ink-soft" />
          ) : (
            <Money value={actualBalance} className="text-display text-canvas" weight="bold" />
          )}
          {unsynced > 0 ? (
            <Text className="text-xs text-subtle">
              Includes {unsynced} unsynced change{unsynced === 1 ? '' : 's'} from this phone
            </Text>
          ) : null}
        </View>
        <View className="h-px bg-ink-soft" />
        <View className="gap-1">
          <Row className="justify-between">
            <Label className="text-subtle">Safe to spend</Label>
            {d ? (
              <Text className="text-xs text-subtle">
                keeps {formatMoney(d.safetyBuffer, { compactZeroCents: true })} buffer
              </Text>
            ) : null}
          </Row>
          {d ? (
            <Money value={d.safeToSpend} className="text-3xl text-accent" weight="bold" />
          ) : (
            <Skeleton className="h-8 w-36 bg-ink-soft" />
          )}
          <Text className="text-xs text-subtle">
            Counts confirmed income only. Likely and uncertain income is excluded until it arrives.
          </Text>
        </View>
      </Card>

      {d?.isEmpty ? (
        <Card className="gap-2">
          <Text weight="semibold">Start with an account</Text>
          <Text className="text-sm text-muted">
            Add your cash, bank or e-wallet accounts, then log transactions with the + button. You
            can also load demo data from Settings to explore.
          </Text>
          <Button
            label="Add an account"
            variant="secondary"
            onPress={() => router.push('/accounts')}
          />
        </Card>
      ) : null}

      {/* This month */}
      {d ? (
        <View className="flex-row gap-3">
          <Card className="flex-1 gap-1">
            <Label>Income · month</Label>
            <Money value={d.month.income} className="text-lg" tone="positive" />
          </Card>
          <Card className="flex-1 gap-1">
            <Label>Spending · month</Label>
            <Money value={d.month.netSpending} className="text-lg" />
            {d.month.refunds > 0 ? (
              <Text className="text-xs text-muted">
                after {formatMoney(d.month.refunds)} refunds
              </Text>
            ) : null}
          </Card>
        </View>
      ) : (
        <Skeleton className="h-20 w-full" />
      )}

      {/* Budget */}
      {showBudgets && d ? (
        <Pressable accessibilityRole="button" onPress={() => router.push('/budgets')}>
          <Card className="gap-2">
            <Row className="justify-between">
              <Label>Budget remaining</Label>
              <Icon name="chevron-right" size={16} color={colors.subtle} />
            </Row>
            {d.budget ? (
              <>
                <Money
                  value={d.budget.remaining}
                  className="text-2xl"
                  tone={d.budget.remaining < 0 ? 'negative' : 'ink'}
                />
                <ProgressBar
                  value={d.budget.limit > 0 ? d.budget.spent / d.budget.limit : 0}
                  tone={d.budget.remaining < 0 ? 'negative' : 'ink'}
                />
                <Text className="text-sm text-muted">
                  {formatMoney(d.budget.dailyAllowance)} a day for the rest of the month ·{' '}
                  {formatMoney(d.budget.spent)} of {formatMoney(d.budget.limit)} spent
                </Text>
              </>
            ) : (
              <Text className="text-sm text-muted">No monthly budget yet. Tap to set one.</Text>
            )}
          </Card>
        </Pressable>
      ) : null}

      {/* Next salary / income */}
      {showCalendar && d?.nextIncome ? (
        <Card className="gap-2">
          <Row className="justify-between">
            <Label>Next income</Label>
            <ConfidenceChip confidence={d.nextIncome.confidence} />
          </Row>
          <Row className="justify-between">
            <View className="flex-1">
              <Text weight="semibold">{d.nextIncome.name}</Text>
              <Text className="text-sm text-muted">{relativeDay(d.nextIncome.date, t)}</Text>
            </View>
            <Money
              value={d.nextIncome.amount}
              className="text-lg"
              tone={d.nextIncome.confidence === 'uncertain' ? 'muted' : 'positive'}
            />
          </Row>
          <Text className="text-xs text-muted">
            Planned — affects projections only, not your actual balance.
          </Text>
        </Card>
      ) : null}

      {/* Cash-flow chart */}
      {showForecast ? (
        <Card className="gap-3">
          <Row className="justify-between">
            <Label>Cash flow</Label>
            {forecast.data?.fromCache ? <Text className="text-xs text-muted">cached</Text> : null}
          </Row>
          <Segmented options={RANGES} value={range} onChange={setRange} />
          {forecast.data ? (
            <CashFlowChart
              actual={forecast.data.data.history}
              projected={forecast.data.data.forecast.points.map((p) => ({
                date: p.date,
                balance: p.balance,
              }))}
              today={forecast.data.data.forecast.asOf}
              buffer={forecast.data.data.forecast.safetyBuffer}
            />
          ) : forecast.isError ? (
            <Text className="text-sm text-muted">{errorMessage(forecast.error)}</Text>
          ) : (
            <Skeleton className="h-48 w-full" />
          )}
          {d ? (
            <>
              <Divider />
              <Row className="justify-between">
                <Text className="text-sm text-muted">Projected month-end</Text>
                {d.projectedMonthEnd === null ? (
                  <Text className="text-sm text-muted">—</Text>
                ) : (
                  <Money value={d.projectedMonthEnd} tone="auto" className="text-sm" />
                )}
              </Row>
              <Row className="justify-between">
                <Text className="text-sm text-muted">Lowest in next 30 days</Text>
                <Text
                  tabular
                  weight="semibold"
                  className={`text-sm ${d.lowest30.balance < 0 ? 'text-negative' : 'text-ink'}`}
                >
                  {formatMoney(d.lowest30.balance)} · {formatDate(d.lowest30.date, false)}
                </Text>
              </Row>
            </>
          ) : null}
        </Card>
      ) : null}

      {/* Upcoming */}
      {showCalendar && d ? (
        <Card className="gap-1">
          <Row className="justify-between pb-1">
            <Label>Upcoming</Label>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.navigate('/plan')}
              hitSlop={8}
            >
              <Text weight="medium" className="text-sm">
                See plan
              </Text>
            </Pressable>
          </Row>
          {d.upcoming.length === 0 ? (
            <Text className="py-2 text-sm text-muted">Nothing planned in the next weeks.</Text>
          ) : (
            d.upcoming.slice(0, 5).map((o) => (
              <Row
                key={`${o.eventId}:${o.originalDate}`}
                className="min-h-12 justify-between gap-3 py-1"
              >
                <View className="flex-1">
                  <Text weight="medium" numberOfLines={1}>
                    {o.name}
                  </Text>
                  <Text className={`text-sm ${o.overdue ? 'text-negative' : 'text-muted'}`}>
                    {o.overdue ? 'Overdue · ' : ''}
                    {relativeDay(o.date, t)}
                    {o.confidence !== 'confirmed' ? ` · ${o.confidence}` : ''}
                  </Text>
                </View>
                <Text
                  tabular
                  weight="semibold"
                  className={
                    o.direction === 'inflow'
                      ? o.confidence === 'uncertain'
                        ? 'text-muted'
                        : 'text-positive'
                      : 'text-ink'
                  }
                >
                  {formatMoney(o.direction === 'inflow' ? o.amount : -o.amount, {
                    signed: o.direction === 'inflow',
                  })}
                </Text>
              </Row>
            ))
          )}
        </Card>
      ) : null}

      {/* Health + alerts */}
      {showInsights && d ? (
        <Pressable accessibilityRole="button" onPress={() => router.push('/insights')}>
          <Card className="flex-row items-center gap-4">
            <View
              className="h-16 w-16 items-center justify-center rounded-full border-4"
              style={{
                borderColor:
                  d.health.score >= 70
                    ? colors.positive
                    : d.health.score >= 45
                      ? colors.warning
                      : colors.negative,
              }}
            >
              <Text weight="bold" tabular className="text-xl">
                {d.health.score}
              </Text>
            </View>
            <View className="flex-1 gap-0.5">
              <Text weight="semibold">Health: {HEALTH_LABEL[d.health.label]}</Text>
              <Text className="text-sm text-muted">
                {d.alertCounts.critical + d.alertCounts.warning + d.alertCounts.info === 0
                  ? 'No active alerts'
                  : `${d.alertCounts.critical} critical · ${d.alertCounts.warning} warning · ${d.alertCounts.info} info`}
              </Text>
            </View>
            <Icon name="chevron-right" size={18} color={colors.subtle} />
          </Card>
        </Pressable>
      ) : null}
    </Screen>
  );
}
