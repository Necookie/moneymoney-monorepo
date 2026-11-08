import type { CreateScheduledEvent } from '@mm/api-client';
import type { Confidence, EventKind, RecurrenceFrequency } from '@mm/types';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AccountChips, CategoryChips, DateField } from '@/components/pickers';
import { FeatureDisabledScreen } from '@/components/FeatureDisabled';
import { Button, Chip, Field, IconButton, Label, Row, Segmented, Text } from '@/components/ui';
import { useLocalAccounts, useLocalCategories, useLocalSettings } from '@/hooks/useLocalData';
import { errorMessage, getApi } from '@/lib/api';
import { today, tryParseMoney } from '@/lib/format';
import { syncNow } from '@/lib/sync/runtime';

const OUT_KINDS: { value: EventKind; label: string }[] = [
  { value: 'bill', label: 'Bill' },
  { value: 'expense', label: 'Expense' },
  { value: 'purchase', label: 'Purchase' },
];
const IN_KINDS: { value: EventKind; label: string }[] = [
  { value: 'salary', label: 'Salary' },
  { value: 'contract', label: 'Contract' },
  { value: 'freelance', label: 'Freelance' },
  { value: 'income', label: 'Other income' },
];
const FREQS: { value: RecurrenceFrequency; label: string }[] = [
  { value: 'none', label: 'Once' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'semimonthly', label: 'Twice a month' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
];

function dayNumber(input: string): number | null {
  const n = Number(input);
  return Number.isInteger(n) && n >= 1 && n <= 31 ? n : null;
}

/** Add a planned item: one-off or recurring; salary twice a month; contracts with an end date. */
export default function NewPlannedItemScreen() {
  const settings = useLocalSettings();
  const qc = useQueryClient();
  const accounts = useLocalAccounts();
  const categories = useLocalCategories();
  const [direction, setDirection] = useState<'outflow' | 'inflow'>('outflow');

  if (settings.data?.features?.calendar === false) {
    return (
      <FeatureDisabledScreen
        title="Plan item"
        featureName="Financial Calendar"
        description="Enable Financial Calendar in Settings to plan upcoming bills, salaries, and recurring schedules."
      />
    );
  }
  const [kind, setKind] = useState<EventKind>('bill');
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [confidence, setConfidence] = useState<Confidence>('confirmed');
  const [startDate, setStartDate] = useState(today());
  const [frequency, setFrequency] = useState<RecurrenceFrequency>('monthly');
  const [day1, setDay1] = useState('15');
  const [day2, setDay2] = useState('30');
  const [hasEnd, setHasEnd] = useState(false);
  const [endDate, setEndDate] = useState(today());
  const [accountId, setAccountId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [installments, setInstallments] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const centavos = tryParseMoney(amount);

  const pickDirection = (d: 'outflow' | 'inflow') => {
    setDirection(d);
    setKind(d === 'inflow' ? 'salary' : 'bill');
    setCategoryId(null);
    if (d === 'inflow') setFrequency('semimonthly');
  };

  const pickKind = (k: EventKind) => {
    setKind(k);
    if (k === 'salary') setFrequency('semimonthly');
    if (k === 'contract') {
      setFrequency('monthly');
      setHasEnd(true);
    }
    if (k === 'purchase') setFrequency('none');
  };

  const save = async () => {
    setError(null);
    if (!name.trim()) return setError('Give it a name.');
    if (!centavos || centavos <= 0) return setError('Enter an amount greater than zero.');
    const d1 = dayNumber(day1);
    const d2 = dayNumber(day2);
    if (frequency === 'semimonthly' && (!d1 || !d2 || d1 === d2)) {
      return setError('Choose two different paydays (1–31).');
    }
    if (hasEnd && frequency !== 'none' && endDate < startDate) {
      return setError('The end date is before the start date.');
    }
    const inst = installments ? Number(installments) : null;
    if (inst !== null && (!Number.isInteger(inst) || inst < 2 || inst > 120)) {
      return setError('Installments must be between 2 and 120.');
    }
    const body: CreateScheduledEvent = {
      name: name.trim(),
      direction,
      kind,
      amount: centavos,
      confidence: direction === 'inflow' ? confidence : 'confirmed',
      accountId,
      categoryId,
      startDate,
      installments: inst,
      recurrence: {
        frequency,
        interval: 1,
        dayOfMonth: frequency === 'semimonthly' ? Math.min(d1!, d2!) : null,
        secondDayOfMonth: frequency === 'semimonthly' ? Math.max(d1!, d2!) : null,
        // "30" means "end of month" for paydays (Feb → 28/29).
        monthEndRule:
          frequency === 'semimonthly' && Math.max(d1!, d2!) >= 30 ? 'last_day' : 'clamp',
        endDate: hasEnd && frequency !== 'none' ? endDate : null,
        count: null,
      },
    };
    setBusy(true);
    try {
      await getApi().planner.create(body);
      await syncNow({ force: true }).catch(() => undefined);
      await qc.invalidateQueries();
      router.back();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-canvas">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Row className="justify-between px-2 pt-1">
          <IconButton icon="x" label="Close" onPress={() => router.back()} />
          <Text weight="semibold" className="text-lg">
            New planned item
          </Text>
          <View className="w-11" />
        </Row>
        <ScrollView
          contentContainerClassName="gap-4 px-4 pb-6 pt-2"
          keyboardShouldPersistTaps="handled"
        >
          <Segmented
            options={[
              { value: 'outflow', label: 'Money out' },
              { value: 'inflow', label: 'Money in' },
            ]}
            value={direction}
            onChange={pickDirection}
          />
          <View className="flex-row flex-wrap gap-2">
            {(direction === 'inflow' ? IN_KINDS : OUT_KINDS).map((k) => (
              <Chip
                key={k.value}
                label={k.label}
                selected={kind === k.value}
                onPress={() => pickKind(k.value)}
              />
            ))}
          </View>
          <Field
            label="Name"
            value={name}
            onChangeText={setName}
            placeholder={direction === 'inflow' ? 'e.g. Salary' : 'e.g. Meralco'}
            maxLength={120}
          />
          <Field
            label="Amount (₱)"
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="0.00"
            error={amount && centavos === null ? 'Use digits with up to 2 decimals' : null}
          />
          {direction === 'inflow' ? (
            <View className="gap-1.5">
              <Label>How sure is it?</Label>
              <Segmented
                options={[
                  { value: 'confirmed', label: 'Confirmed' },
                  { value: 'likely', label: 'Likely' },
                  { value: 'uncertain', label: 'Uncertain' },
                ]}
                value={confidence}
                onChange={setConfidence}
              />
              <Text className="text-xs text-muted">
                Only confirmed income counts toward Safe to spend. Likely and uncertain income only
                shows in projections.
              </Text>
            </View>
          ) : null}
          <DateField
            label={frequency === 'none' ? 'Date' : 'Starts'}
            value={startDate}
            onChange={setStartDate}
            quick="future"
          />
          <View className="gap-1.5">
            <Label>Repeats</Label>
            <View className="flex-row flex-wrap gap-2">
              {FREQS.map((f) => (
                <Chip
                  key={f.value}
                  label={f.label}
                  selected={frequency === f.value}
                  onPress={() => setFrequency(f.value)}
                />
              ))}
            </View>
          </View>
          {frequency === 'semimonthly' ? (
            <Row className="gap-3">
              <Field
                className="flex-1"
                label="First day"
                value={day1}
                onChangeText={setDay1}
                keyboardType="number-pad"
                maxLength={2}
              />
              <Field
                className="flex-1"
                label="Second day"
                value={day2}
                onChangeText={setDay2}
                keyboardType="number-pad"
                maxLength={2}
                hint="30/31 = last day"
              />
            </Row>
          ) : null}
          {frequency !== 'none' ? (
            <View className="gap-2">
              <Row className="flex-wrap gap-2">
                <Chip label="No end date" selected={!hasEnd} onPress={() => setHasEnd(false)} />
                <Chip label="Ends on a date" selected={hasEnd} onPress={() => setHasEnd(true)} />
              </Row>
              {hasEnd ? (
                <DateField
                  label="Ends"
                  value={endDate}
                  onChange={setEndDate}
                  minDate={startDate}
                  quick="none"
                />
              ) : null}
            </View>
          ) : null}
          {kind === 'purchase' ? (
            <Field
              label="Installments (optional)"
              value={installments}
              onChangeText={setInstallments}
              keyboardType="number-pad"
              hint="Split into monthly payments, e.g. 12"
              maxLength={3}
            />
          ) : null}
          <View className="gap-1.5">
            <Label>Account (optional)</Label>
            <AccountChips
              accounts={accounts.data?.accounts ?? []}
              value={accountId}
              onChange={(id) => setAccountId(id === accountId ? null : id)}
            />
          </View>
          <View className="gap-1.5">
            <Label>Category (optional)</Label>
            <CategoryChips
              categories={categories.data ?? []}
              kind={direction === 'inflow' ? 'income' : 'expense'}
              value={categoryId}
              onChange={setCategoryId}
            />
          </View>
          <Text className="text-xs text-muted">
            Planned items affect projections only — your actual balance changes when you mark them
            paid.
          </Text>
          {error ? <Text className="text-sm text-negative">{error}</Text> : null}
          <Button label="Add to plan" variant="primary" size="lg" loading={busy} onPress={save} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
