import type { Goal } from '@mm/api-client';
import type { GoalKind } from '@mm/types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { DateField } from '@/components/pickers';
import { Screen } from '@/components/Screen';
import {
  Banner,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorCard,
  Field,
  Label,
  Money,
  ProgressBar,
  Row,
  Segmented,
  Sheet,
  Skeleton,
  Text,
} from '@/components/ui';
import { FeatureGate } from '@/components/FeatureDisabled';
import { useCachedQuery } from '@/hooks/useCachedQuery';
import { errorMessage, getApi } from '@/lib/api';
import { formatDate, formatMoney, percent, today, tryParseMoney } from '@/lib/format';

const KINDS: { value: GoalKind; label: string }[] = [
  { value: 'emergency', label: 'Emergency fund' },
  { value: 'investment', label: 'Investment' },
  { value: 'vehicle', label: 'Vehicle' },
  { value: 'electronics', label: 'Electronics' },
  { value: 'travel', label: 'Travel' },
  { value: 'custom', label: 'Other' },
];

function AllocateSheet({ goal, onClose }: { goal: Goal | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [direction, setDirection] = useState<'add' | 'withdraw'>('add');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(today());
  const allocate = useMutation({
    mutationFn: async () => {
      const value = tryParseMoney(amount);
      if (!goal) return null;
      if (!value || value <= 0) throw new Error('Enter an amount greater than zero.');
      return getApi().goals.allocate(goal.id, {
        amount: direction === 'add' ? value : -value,
        allocatedOn: date,
        note: note.trim() || null,
      });
    },
    onSuccess: async () => {
      setAmount('');
      setNote('');
      onClose();
      await qc.invalidateQueries({ queryKey: ['goals'] });
      await qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
  return (
    <Sheet visible={!!goal} onClose={onClose} title={goal ? `Allocate · ${goal.name}` : 'Allocate'}>
      <Segmented
        options={[
          { value: 'add', label: 'Set aside' },
          { value: 'withdraw', label: 'Take out' },
        ]}
        value={direction}
        onChange={setDirection}
      />
      <Field
        label="Amount (₱)"
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        placeholder="0.00"
      />
      <DateField value={date} onChange={setDate} />
      <Field label="Note (optional)" value={note} onChangeText={setNote} maxLength={200} />
      <Text className="text-xs text-muted">
        Allocations earmark money toward the goal; they don&apos;t move money between accounts.
      </Text>
      {allocate.error ? (
        <Text className="text-sm text-negative">{errorMessage(allocate.error)}</Text>
      ) : null}
      <Button
        label="Save allocation"
        variant="dark"
        loading={allocate.isPending}
        onPress={() => allocate.mutate()}
      />
    </Sheet>
  );
}

function NewGoalSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<GoalKind>('emergency');
  const [target, setTarget] = useState('');
  const [monthly, setMonthly] = useState('');
  const [hasDate, setHasDate] = useState(false);
  const [targetDate, setTargetDate] = useState(today());
  const create = useMutation({
    mutationFn: async () => {
      const t = tryParseMoney(target);
      const m = monthly ? tryParseMoney(monthly) : null;
      if (!name.trim()) throw new Error('Give the goal a name.');
      if (!t || t <= 0) throw new Error('Enter a target amount.');
      if (monthly && (m === null || m < 0))
        throw new Error('Monthly contribution is not a valid amount.');
      return getApi().goals.create({
        name: name.trim(),
        kind,
        targetAmount: t,
        monthlyContribution: m,
        targetDate: hasDate ? targetDate : null,
      });
    },
    onSuccess: async () => {
      setName('');
      setTarget('');
      setMonthly('');
      onClose();
      await qc.invalidateQueries({ queryKey: ['goals'] });
    },
  });
  return (
    <Sheet visible={visible} onClose={onClose} title="New goal">
      <Field label="Name" value={name} onChangeText={setName} maxLength={120} />
      <View className="flex-row flex-wrap gap-2">
        {KINDS.map((k) => (
          <Chip
            key={k.value}
            label={k.label}
            selected={kind === k.value}
            onPress={() => setKind(k.value)}
          />
        ))}
      </View>
      <Field
        label="Target (₱)"
        value={target}
        onChangeText={setTarget}
        keyboardType="decimal-pad"
      />
      <Field
        label="Monthly contribution (₱, optional)"
        value={monthly}
        onChangeText={setMonthly}
        keyboardType="decimal-pad"
      />
      <Row className="gap-2">
        <Chip label="No deadline" selected={!hasDate} onPress={() => setHasDate(false)} />
        <Chip label="Target date" selected={hasDate} onPress={() => setHasDate(true)} />
      </Row>
      {hasDate ? (
        <DateField
          label="Target date"
          value={targetDate}
          onChange={setTargetDate}
          minDate={today()}
          quick="none"
        />
      ) : null}
      {create.error ? (
        <Text className="text-sm text-negative">{errorMessage(create.error)}</Text>
      ) : null}
      <Button
        label="Create goal"
        variant="dark"
        loading={create.isPending}
        onPress={() => create.mutate()}
      />
    </Sheet>
  );
}

export default function GoalsScreen() {
  return (
    <FeatureGate
      feature="goals"
      title="Goals"
      featureName="Goals"
      description="Enable Goals in Settings to set savings targets and track emergency reserves."
    >
      <GoalsContent />
    </FeatureGate>
  );
}

function GoalsContent() {
  const goals = useCachedQuery(['goals'], () => getApi().goals.list());
  const [active, setActive] = useState<Goal | null>(null);
  const [creating, setCreating] = useState(false);
  const list = (goals.data?.data ?? []).filter((g) => !g.archived);

  return (
    <Screen title="Goals" back refreshing={goals.isRefetching} onRefresh={() => goals.refetch()}>
      {goals.data?.fromCache ? (
        <Banner tone="neutral" icon="offline" title="Offline — last saved goals" />
      ) : null}
      {goals.isError && !goals.data ? (
        <ErrorCard message={errorMessage(goals.error)} onRetry={() => goals.refetch()} />
      ) : null}
      {goals.isLoading ? <Skeleton className="h-32 w-full" /> : null}
      {goals.data && list.length === 0 ? (
        <EmptyState
          icon="flag"
          title="No goals yet"
          body="Start with an emergency fund — 3 to 6 months of expenses."
        />
      ) : null}
      {list.map((g) => (
        <Pressable
          key={g.id}
          accessibilityRole="button"
          accessibilityHint="Allocate money to this goal"
          onPress={() => setActive(g)}
        >
          <Card className="gap-2">
            <Row className="justify-between">
              <Text weight="semibold">{g.name}</Text>
              {g.projection.complete ? (
                <Chip label="Complete" tone="positive" />
              ) : g.projection.onTrack === false ? (
                <Chip label="Off track" tone="warning" />
              ) : g.projection.onTrack ? (
                <Chip label="On track" tone="positive" />
              ) : null}
            </Row>
            <Row className="items-end justify-between">
              <Money value={g.currentAmount} className="text-xl" />
              <Text tabular className="text-sm text-muted">
                of {formatMoney(g.targetAmount)} · {percent(g.projection.progressBps)}
              </Text>
            </Row>
            <ProgressBar
              value={g.projection.progressBps / 10_000}
              tone={g.projection.complete ? 'positive' : 'ink'}
            />
            <Text className="text-sm text-muted">
              {g.projection.complete
                ? 'Target reached.'
                : [
                    g.projection.estimatedCompletionDate
                      ? `Est. ${formatDate(g.projection.estimatedCompletionDate)}`
                      : 'Set a monthly contribution to estimate a date',
                    g.projection.requiredMonthlyContribution !== null
                      ? `needs ${formatMoney(g.projection.requiredMonthlyContribution)}/mo`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
            </Text>
            <Label className="pt-1">Tap to allocate</Label>
          </Card>
        </Pressable>
      ))}
      <Button label="New goal" variant="primary" icon="plus" onPress={() => setCreating(true)} />
      <AllocateSheet goal={active} onClose={() => setActive(null)} />
      <NewGoalSheet visible={creating} onClose={() => setCreating(false)} />
    </Screen>
  );
}
