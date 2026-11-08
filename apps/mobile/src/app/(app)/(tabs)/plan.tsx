import type { OccurrenceDto } from '@mm/api-client';
import {
  addDays,
  endOfMonth,
  formatDate,
  formatMonth,
  startOfMonth,
  toDecimalString,
} from '@mm/finance-engine';
import { useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { ConfidenceChip } from '@/components/finance';
import { Icon } from '@/components/Icon';
import { AccountChips, MonthCalendar } from '@/components/pickers';
import { Screen } from '@/components/Screen';
import { SyncIndicator } from '@/components/SyncIndicator';
import {
  Banner,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorCard,
  Field,
  Label,
  Row,
  Segmented,
  Sheet,
  Skeleton,
  Text,
} from '@/components/ui';
import { FeatureDisabledScreen } from '@/components/FeatureDisabled';
import { useCachedQuery } from '@/hooks/useCachedQuery';
import { useLocalAccounts, useLocalSettings, useLocalUpcoming } from '@/hooks/useLocalData';
import { errorMessage, getApi } from '@/lib/api';
import { formatMoney, relativeDay, today, tryParseMoney } from '@/lib/format';
import * as Notif from '@/lib/notifications';
import { getSyncRuntime, syncNow } from '@/lib/sync/runtime';
import { colors } from '@/lib/theme';

type PlanView = 'timeline' | 'month';

function occKey(o: OccurrenceDto) {
  return `${o.eventId}:${o.originalDate}`;
}

function OccurrenceRow({ o, onPress }: { o: OccurrenceDto; onPress: () => void }) {
  const inflow = o.direction === 'inflow';
  const done = o.settled || o.skipped;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${o.name}, ${formatMoney(o.amount)}, ${formatDate(o.date)}`}
      onPress={onPress}
      disabled={done}
      className={`min-h-16 flex-row items-center gap-3 py-2 ${done ? 'opacity-50' : 'active:opacity-70'}`}
    >
      <View className="h-10 w-10 items-center justify-center rounded-full bg-canvas">
        <Icon
          name={
            o.settled
              ? 'circle-check'
              : o.skipped
                ? 'skip-forward'
                : inflow
                  ? 'arrow-down-left'
                  : 'arrow-up-right'
          }
          size={18}
          color={o.overdue && !done ? colors.negative : colors.inkSoft}
        />
      </View>
      <View className="flex-1 gap-0.5">
        <Text weight="medium" numberOfLines={1}>
          {o.name}
        </Text>
        <Row className="flex-wrap gap-1.5">
          <Text className={`text-sm ${o.overdue && !done ? 'text-negative' : 'text-muted'}`}>
            {o.settled
              ? 'Paid'
              : o.skipped
                ? 'Skipped'
                : o.overdue
                  ? 'Overdue'
                  : o.rescheduled
                    ? 'Moved'
                    : 'Planned'}
            {o.installmentCount ? ` · ${o.index + 1}/${o.installmentCount}` : ''}
          </Text>
          {inflow && o.confidence !== 'confirmed' ? (
            <ConfidenceChip confidence={o.confidence} />
          ) : null}
        </Row>
      </View>
      <Text
        tabular
        weight="semibold"
        className={
          inflow ? (o.confidence === 'uncertain' ? 'text-muted' : 'text-positive') : 'text-ink'
        }
      >
        {formatMoney(inflow ? o.amount : -o.amount, { signed: inflow })}
      </Text>
    </Pressable>
  );
}

function ReminderPrompt() {
  const [state, setState] = useState<'hidden' | 'offer' | 'denied'>('hidden');
  useEffect(() => {
    (async () => {
      const { storage } = await getSyncRuntime();
      if (await Notif.isEnabled(storage)) return;
      const perm = await Notif.getPermission();
      setState(perm === 'denied' ? 'hidden' : 'offer');
    })().catch(() => undefined);
  }, []);
  if (state === 'hidden') return null;
  if (state === 'denied') {
    return (
      <Banner tone="neutral" icon="info" title="Notifications are blocked in Android settings." />
    );
  }
  return (
    <Banner
      tone="info"
      icon="clock"
      title="Get a reminder the day before bills"
      body="A local notification at 9:00 AM the day before each planned payment. Nothing leaves your phone."
      action={
        <>
          <Button
            label="Turn on"
            variant="dark"
            onPress={async () => {
              const perm = await Notif.requestPermission();
              if (perm !== 'granted') return setState('denied');
              const { storage } = await getSyncRuntime();
              await Notif.setEnabled(storage, true);
              await Notif.rescheduleBillReminders(storage, await storage.listUpcoming());
              setState('hidden');
            }}
          />
          <Button label="Not now" variant="ghost" onPress={() => setState('hidden')} />
        </>
      }
    />
  );
}

function OccurrenceSheet({ o, onClose }: { o: OccurrenceDto | null; onClose: () => void }) {
  const qc = useQueryClient();
  const accounts = useLocalAccounts();
  const [mode, setMode] = useState<'menu' | 'paid' | 'postpone'>('menu');
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState<string | null>(null);
  const [month, setMonth] = useState(today());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!o) return;
    setMode('menu');
    setError(null);
    setAmount(toDecimalString(o.amount));
    setAccountId(o.accountId);
    setMonth(o.date);
  }, [o]);

  if (!o) return null;

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await syncNow({ force: true }).catch(() => undefined);
      await qc.invalidateQueries();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const api = getApi();
  const paidAmount = tryParseMoney(amount);

  return (
    <Sheet visible onClose={onClose} title={o.name}>
      <Row className="justify-between">
        <Text className="text-muted">
          {relativeDay(o.date)} · {o.kind}
        </Text>
        <Text tabular weight="semibold">
          {formatMoney(o.amount)}
        </Text>
      </Row>
      <Text className="text-xs text-muted">
        Planned — affects projections only until marked paid.
      </Text>
      {mode === 'menu' ? (
        <View className="gap-2">
          <Button
            label={o.direction === 'inflow' ? 'Mark received' : 'Mark paid'}
            variant="primary"
            icon="check"
            onPress={() => setMode('paid')}
          />
          <Button
            label="Postpone"
            variant="secondary"
            icon="calendar"
            onPress={() => setMode('postpone')}
          />
          <Button
            label="Skip this one"
            variant="secondary"
            icon="skip-forward"
            loading={busy}
            onPress={() =>
              Alert.alert(
                'Skip this occurrence?',
                `${o.name} on ${formatDate(o.date)} will be skipped.`,
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Skip',
                    onPress: () => run(() => api.planner.skip(o.eventId, o.originalDate)),
                  },
                ],
              )
            }
          />
        </View>
      ) : null}
      {mode === 'paid' ? (
        <View className="gap-3">
          <Field
            label="Actual amount (₱)"
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            error={paidAmount === null || paidAmount <= 0 ? 'Enter a valid amount' : null}
          />
          <View className="gap-1.5">
            <Label>Account</Label>
            <AccountChips
              accounts={accounts.data?.accounts ?? []}
              value={accountId}
              onChange={setAccountId}
            />
          </View>
          <Text className="text-xs text-muted">
            Records a real transaction dated today. Needs a connection.
          </Text>
          <Button
            label="Confirm"
            variant="dark"
            loading={busy}
            disabled={!paidAmount || paidAmount <= 0}
            onPress={() =>
              run(() =>
                api.planner.markPaid(o.eventId, {
                  occurrenceDate: o.originalDate,
                  transactionId: Crypto.randomUUID(),
                  amount: paidAmount ?? undefined,
                  occurredOn: today(),
                  ...(accountId ? { accountId } : {}),
                }),
              )
            }
          />
        </View>
      ) : null}
      {mode === 'postpone' ? (
        <MonthCalendar
          month={month}
          onMonthChange={setMonth}
          selected={o.date}
          minDate={addDays(o.date, 1)}
          onSelect={(d) => run(() => api.planner.postpone(o.eventId, o.originalDate, d))}
        />
      ) : null}
      {error ? <Text className="text-sm text-negative">{error}</Text> : null}
    </Sheet>
  );
}

export default function PlanScreen() {
  const settings = useLocalSettings();
  const [view, setView] = useState<PlanView>('timeline');
  const t = today();
  const [month, setMonth] = useState(t);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [active, setActive] = useState<OccurrenceDto | null>(null);
  const from = view === 'timeline' ? addDays(t, -14) : startOfMonth(month);
  const to = view === 'timeline' ? addDays(t, 90) : endOfMonth(month);

  if (settings.data?.features?.calendar === false) {
    return (
      <FeatureDisabledScreen
        title="Calendar"
        featureName="Financial Calendar"
        description="Enable Financial Calendar in Settings to plan upcoming bills, salaries, and recurring schedules."
      />
    );
  }
  const occ = useCachedQuery(['occurrences', from, to], () =>
    getApi().planner.occurrences(from, to),
  );
  const localUpcoming = useLocalUpcoming();
  const [refreshing, setRefreshing] = useState(false);

  // Offline without a cached copy: fall back to the 60-day window from the last sync.
  const items = useMemo(() => {
    const list = occ.data?.data ?? (occ.isError ? (localUpcoming.data ?? []) : []);
    return [...list]
      .filter((o) => view === 'month' || !(o.settled || o.skipped) || o.date >= t)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }, [occ.data, occ.isError, localUpcoming.data, view, t]);

  const marks = useMemo(() => {
    const m = new Map<string, 'inflow' | 'outflow' | 'both'>();
    for (const o of items) {
      const prev = m.get(o.date);
      m.set(o.date, prev && prev !== o.direction ? 'both' : o.direction);
    }
    return m;
  }, [items]);

  const shown =
    view === 'month' && selectedDay ? items.filter((o) => o.date === selectedDay) : items;
  const groups = useMemo(() => {
    const g: { date: string; items: OccurrenceDto[] }[] = [];
    for (const o of shown) {
      const last = g[g.length - 1];
      if (last && last.date === o.date) last.items.push(o);
      else g.push({ date: o.date, items: [o] });
    }
    return g;
  }, [shown]);

  const totals = useMemo(() => {
    let inflow = 0;
    let outflow = 0;
    for (const o of items) {
      if (o.settled || o.skipped || o.date < t) continue;
      if (o.direction === 'inflow' && o.confidence === 'confirmed') inflow += o.amount;
      if (o.direction === 'outflow') outflow += o.amount;
    }
    return { inflow, outflow };
  }, [items, t]);

  return (
    <Screen
      title="Financial calendar"
      right={<SyncIndicator />}
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        try {
          await syncNow({ force: true });
          await occ.refetch();
        } finally {
          setRefreshing(false);
        }
      }}
    >
      <Segmented
        options={[
          { value: 'timeline', label: 'Timeline' },
          { value: 'month', label: 'Month' },
        ]}
        value={view}
        onChange={(v) => {
          setView(v);
          setSelectedDay(null);
        }}
      />
      <Button
        label="Add planned item"
        variant="primary"
        icon="plus"
        onPress={() => router.push('/plan-new')}
      />
      <ReminderPrompt />

      {occ.data?.fromCache || (occ.isError && localUpcoming.data?.length) ? (
        <Banner
          tone="neutral"
          icon="offline"
          title="Offline — showing your plan from the last sync"
        />
      ) : null}
      {occ.isError && !localUpcoming.data?.length ? (
        <ErrorCard message={errorMessage(occ.error)} onRetry={() => occ.refetch()} />
      ) : null}

      <Card className="flex-row gap-4">
        <View className="flex-1 gap-0.5">
          <Label>Planned out</Label>
          <Text tabular weight="semibold" className="text-lg">
            {formatMoney(totals.outflow)}
          </Text>
        </View>
        <View className="flex-1 gap-0.5">
          <Label>Confirmed in</Label>
          <Text tabular weight="semibold" className="text-lg text-positive">
            {formatMoney(totals.inflow)}
          </Text>
        </View>
      </Card>
      <Text className="text-xs text-muted">
        {view === 'timeline' ? 'Next 90 days. ' : `${formatMonth(month.slice(0, 7))}. `}
        Planned items don&apos;t change your actual balance. Unconfirmed income is not counted
        above.
      </Text>

      {view === 'month' ? (
        <Card>
          <MonthCalendar
            month={month}
            onMonthChange={(m) => {
              setMonth(m);
              setSelectedDay(null);
            }}
            selected={selectedDay}
            onSelect={(d) => setSelectedDay(d === selectedDay ? null : d)}
            marks={marks}
          />
          {selectedDay ? (
            <Chip
              label={`Showing ${formatDate(selectedDay, false)} · clear`}
              onPress={() => setSelectedDay(null)}
            />
          ) : null}
        </Card>
      ) : null}

      {occ.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : groups.length === 0 ? (
        <EmptyState
          icon="calendar"
          title="Nothing planned"
          body="Add your salary, bills and planned purchases to see what's coming."
        />
      ) : (
        <Card className="gap-0 py-2">
          {groups.map((g) => (
            <View key={g.date}>
              <Text weight="semibold" className="pt-2 text-sm text-muted">
                {relativeDay(g.date, t)}
              </Text>
              {g.items.map((o) => (
                <OccurrenceRow key={occKey(o)} o={o} onPress={() => setActive(o)} />
              ))}
            </View>
          ))}
        </Card>
      )}
      <OccurrenceSheet o={active} onClose={() => setActive(null)} />
    </Screen>
  );
}
