import type { ScenarioDto, ScenarioResponse } from '@mm/api-client';
import { addDays } from '@mm/finance-engine';
import { FORECAST_HORIZONS, type ForecastHorizon, type ForecastMode } from '@mm/types';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { CashFlowChart } from '@/components/CashFlowChart';
import { Icon } from '@/components/Icon';
import { DateField } from '@/components/pickers';
import { Screen } from '@/components/Screen';
import {
  Banner,
  Button,
  Card,
  Chip,
  Divider,
  ErrorCard,
  Field,
  Label,
  Money,
  Row,
  Segmented,
  Skeleton,
  Text,
} from '@/components/ui';
import { useCachedQuery } from '@/hooks/useCachedQuery';
import { errorMessage, getApi } from '@/lib/api';
import { formatDate, formatMoney, today, tryParseMoney } from '@/lib/format';
import { colors } from '@/lib/theme';

const MODES: { value: ForecastMode; label: string }[] = [
  { value: 'conservative', label: 'Cautious' },
  { value: 'expected', label: 'Expected' },
  { value: 'optimistic', label: 'Hopeful' },
];
const HORIZONS = (Object.keys(FORECAST_HORIZONS) as ForecastHorizon[]).map((k) => ({
  value: k,
  label: k,
}));

type ScenarioKind = 'salary_delayed' | 'income_lost' | 'purchase_added' | 'spending_reduced';
const SCENARIOS: { value: ScenarioKind; label: string }[] = [
  { value: 'salary_delayed', label: 'Salary delayed' },
  { value: 'income_lost', label: 'Income stops' },
  { value: 'purchase_added', label: 'Big purchase' },
  { value: 'spending_reduced', label: 'Spend less' },
];

function Stat({
  label,
  value,
  tone,
  signed,
}: {
  label: string;
  value: number;
  tone?: 'auto' | 'ink';
  signed?: boolean;
}) {
  return (
    <Row className="min-h-10 justify-between">
      <Text className="text-sm text-muted">{label}</Text>
      <Money value={value} tone={tone ?? 'auto'} signed={signed} className="text-sm" />
    </Row>
  );
}

export default function ForecastScreen() {
  const [mode, setMode] = useState<ForecastMode>('expected');
  const [range, setRange] = useState<ForecastHorizon>('90d');
  const [showWhy, setShowWhy] = useState(false);
  const horizon = FORECAST_HORIZONS[range];
  const forecast = useCachedQuery(['forecast', 'full', mode, range], () =>
    getApi().forecast.get({ horizonDays: horizon, mode, historyDays: Math.min(horizon, 90) }),
  );
  const f = forecast.data?.data.forecast;

  const [kind, setKind] = useState<ScenarioKind>('salary_delayed');
  const [days, setDays] = useState('7');
  const [percentCut, setPercentCut] = useState('20');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(addDays(today(), 7));
  const scenario = useMutation<ScenarioResponse, Error>({
    mutationFn: () => {
      let s: ScenarioDto;
      if (kind === 'salary_delayed') {
        const n = Number(days);
        if (!Number.isInteger(n) || n < 1 || n > 180) throw new Error('Delay must be 1–180 days.');
        s = { type: 'salary_delayed', days: n };
      } else if (kind === 'income_lost') {
        s = { type: 'income_lost', fromDate: date };
      } else if (kind === 'purchase_added') {
        const v = tryParseMoney(amount);
        if (!v || v <= 0) throw new Error('Enter the purchase amount.');
        s = { type: 'purchase_added', amount: v, date, name: 'What-if purchase' };
      } else {
        const p = Number(percentCut);
        if (!Number.isInteger(p) || p < 1 || p > 100)
          throw new Error('Use a whole percent from 1 to 100.');
        s = { type: 'spending_reduced', percent: p };
      }
      return getApi().forecast.scenarios({
        horizonDays: Math.min(Math.max(horizon, 30), 730),
        mode,
        scenarios: [{ type: 'baseline', label: 'Today’s plan' }, s],
      });
    },
  });

  return (
    <Screen
      title="Forecast"
      back
      refreshing={forecast.isRefetching}
      onRefresh={() => forecast.refetch()}
    >
      <Segmented options={MODES} value={mode} onChange={setMode} />
      <Segmented options={HORIZONS} value={range} onChange={setRange} />
      {forecast.data?.fromCache ? (
        <Banner tone="neutral" icon="offline" title="Offline — last saved forecast" />
      ) : null}
      {forecast.isError && !forecast.data ? (
        <ErrorCard message={errorMessage(forecast.error)} onRetry={() => forecast.refetch()} />
      ) : null}

      <Card className="gap-3">
        {forecast.data && f ? (
          <CashFlowChart
            actual={forecast.data.data.history}
            projected={f.points.map((p) => ({ date: p.date, balance: p.balance }))}
            today={f.asOf}
            buffer={f.safetyBuffer}
          />
        ) : (
          <Skeleton className="h-48 w-full" />
        )}
        {f ? (
          <View>
            <Stat label="Starting (actual)" value={f.startingBalance} tone="ink" />
            <Divider />
            <Stat label={`Projected on ${formatDate(f.endDate, false)}`} value={f.endingBalance} />
            <Divider />
            <Row className="min-h-10 justify-between">
              <Text className="text-sm text-muted">Lowest point</Text>
              <Text
                tabular
                weight="semibold"
                className={`text-sm ${f.lowest.balance < 0 ? 'text-negative' : 'text-ink'}`}
              >
                {formatMoney(f.lowest.balance)} · {formatDate(f.lowest.date, false)}
              </Text>
            </Row>
            <Divider />
            <Stat label="Safe to spend" value={f.safeToSpend} />
          </View>
        ) : null}
      </Card>

      {f?.firstShortfallDate ? (
        <Banner
          tone="negative"
          icon="triangle-alert"
          title={`Projected to go below zero on ${formatDate(f.firstShortfallDate)}`}
          body="Planned outflows exceed expected funds. Consider postponing a purchase or bill."
        />
      ) : f?.firstBelowBufferDate ? (
        <Banner
          tone="warning"
          icon="triangle-alert"
          title={`Dips under your ${formatMoney(f.safetyBuffer, { compactZeroCents: true })} buffer on ${formatDate(f.firstBelowBufferDate)}`}
        />
      ) : null}
      {f && f.excludedInflow.count > 0 ? (
        <Text className="text-xs text-muted">
          {f.excludedInflow.count} uncertain income item{f.excludedInflow.count === 1 ? '' : 's'} (
          {formatMoney(f.excludedInflow.amount)}) excluded in this mode.
        </Text>
      ) : null}

      {f ? (
        <Card className="gap-2">
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showWhy }}
            onPress={() => setShowWhy((v) => !v)}
            className="min-h-11 flex-row items-center justify-between"
          >
            <Text weight="semibold">How this was calculated</Text>
            <Icon name={showWhy ? 'minus' : 'plus'} size={18} color={colors.muted} />
          </Pressable>
          {showWhy
            ? f.assumptions.map((a, i) => (
                <Text key={i} className="text-sm text-ink-soft">
                  • {a}
                </Text>
              ))
            : null}
        </Card>
      ) : null}

      <Label className="px-1 pt-2">What if…</Label>
      <Card className="gap-3">
        <View className="flex-row flex-wrap gap-2">
          {SCENARIOS.map((s) => (
            <Chip
              key={s.value}
              label={s.label}
              selected={kind === s.value}
              onPress={() => setKind(s.value)}
            />
          ))}
        </View>
        {kind === 'salary_delayed' ? (
          <Field
            label="Delay (days)"
            value={days}
            onChangeText={setDays}
            keyboardType="number-pad"
            maxLength={3}
          />
        ) : null}
        {kind === 'spending_reduced' ? (
          <Field
            label="Cut flexible spending by (%)"
            value={percentCut}
            onChangeText={setPercentCut}
            keyboardType="number-pad"
            maxLength={3}
          />
        ) : null}
        {kind === 'purchase_added' ? (
          <Field
            label="Amount (₱)"
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
          />
        ) : null}
        {kind === 'purchase_added' || kind === 'income_lost' ? (
          <DateField
            label={kind === 'income_lost' ? 'Income stops from' : 'Purchase date'}
            value={date}
            onChange={setDate}
            quick="future"
          />
        ) : null}
        <Button
          label="Compare"
          variant="dark"
          loading={scenario.isPending}
          onPress={() => scenario.mutate()}
        />
        {scenario.error ? (
          <Text className="text-sm text-negative">{errorMessage(scenario.error)}</Text>
        ) : null}
        {scenario.data?.comparisons.map((c) => (
          <View key={c.label} className="gap-1 rounded-input bg-canvas p-3">
            <Text weight="semibold">{c.label}</Text>
            <Stat label="Ending balance" value={c.result.endingBalance} />
            <Stat label="Lowest balance" value={c.result.lowest.balance} />
            {c.scenario.type !== 'baseline' ? (
              <>
                <Stat label="Change at end" value={c.delta.endingBalance} signed />
                <Stat label="Change at lowest" value={c.delta.lowestBalance} signed />
              </>
            ) : null}
            {c.result.firstShortfallDate ? (
              <Text className="text-sm text-negative">
                Below zero on {formatDate(c.result.firstShortfallDate)}
              </Text>
            ) : null}
          </View>
        ))}
      </Card>
    </Screen>
  );
}
