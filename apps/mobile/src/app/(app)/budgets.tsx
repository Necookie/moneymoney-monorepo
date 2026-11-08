import type { Budget } from '@mm/api-client';
import { toDecimalString } from '@mm/finance-engine';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { CategoryChips } from '@/components/pickers';
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
  Sheet,
  Skeleton,
  Text,
} from '@/components/ui';
import { FeatureDisabledScreen } from '@/components/FeatureDisabled';
import { useCachedQuery } from '@/hooks/useCachedQuery';
import { useLocalCategories, useLocalSettings } from '@/hooks/useLocalData';
import { errorMessage, getApi } from '@/lib/api';
import { formatMoney, percent, tryParseMoney } from '@/lib/format';

const STATE = {
  ok: { label: 'On track', tone: 'positive' },
  approaching: { label: 'Approaching', tone: 'warning' },
  over_pace: { label: 'Over pace', tone: 'warning' },
  exceeded: { label: 'Exceeded', tone: 'negative' },
} as const;

export default function BudgetsScreen() {
  const settings = useLocalSettings();
  const api = getApi();
  const qc = useQueryClient();
  const budgets = useCachedQuery(['budgets'], () => api.budgets.list());
  const categories = useLocalCategories();
  const [editing, setEditing] = useState<Budget | 'new' | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');

  if (settings.data?.features?.budgets === false) {
    return (
      <FeatureDisabledScreen
        title="Budgets"
        featureName="Budgets"
        description="Enable Budgets in Settings to set monthly limits and monitor spending pace."
      />
    );
  }

  const save = useMutation({
    mutationFn: async () => {
      const value = tryParseMoney(amount);
      if (!value || value <= 0) throw new Error('Enter a monthly limit greater than zero.');
      if (editing === 'new') return api.budgets.create({ categoryId, amount: value });
      if (editing) return api.budgets.update(editing.id, { amount: value });
      return null;
    },
    onSuccess: async () => {
      setEditing(null);
      await qc.invalidateQueries({ queryKey: ['budgets'] });
      await qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const remove = (b: Budget) =>
    Alert.alert('Delete budget?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.budgets.remove(b.id);
            setEditing(null);
            await qc.invalidateQueries({ queryKey: ['budgets'] });
          } catch (err) {
            Alert.alert('Could not delete', errorMessage(err));
          }
        },
      },
    ]);

  const categoryName = (id: string | null) =>
    id ? (categories.data?.find((c) => c.id === id)?.name ?? 'Category') : 'All spending';

  const list = budgets.data?.data ?? [];

  return (
    <Screen
      title="Budgets"
      subtitle="This month"
      back
      refreshing={budgets.isRefetching}
      onRefresh={() => budgets.refetch()}
    >
      {budgets.data?.fromCache ? (
        <Banner tone="neutral" icon="offline" title="Offline — last saved budgets" />
      ) : null}
      {budgets.isError && !budgets.data ? (
        <ErrorCard message={errorMessage(budgets.error)} onRetry={() => budgets.refetch()} />
      ) : null}
      {budgets.isLoading ? <Skeleton className="h-32 w-full" /> : null}
      {budgets.data && list.length === 0 ? (
        <EmptyState
          icon="chart-pie"
          title="No budgets yet"
          body="Set a monthly limit for all spending or per category."
        />
      ) : null}
      {list.map((b) => {
        const st = STATE[b.status.state];
        return (
          <Pressable
            key={b.id}
            accessibilityRole="button"
            onPress={() => {
              setEditing(b);
              setAmount(toDecimalString(b.amount));
              save.reset();
            }}
          >
            <Card className="gap-2">
              <Row className="justify-between">
                <Text weight="semibold">{categoryName(b.categoryId)}</Text>
                <Chip label={st.label} tone={st.tone} />
              </Row>
              <Row className="items-end justify-between">
                <View>
                  <Label>Remaining</Label>
                  <Money
                    value={b.status.remaining}
                    className="text-xl"
                    tone={b.status.remaining < 0 ? 'negative' : 'ink'}
                  />
                </View>
                <Text tabular className="text-sm text-muted">
                  {formatMoney(b.status.spent)} / {formatMoney(b.amount)} ·{' '}
                  {percent(b.status.utilizationBps)}
                </Text>
              </Row>
              <ProgressBar
                value={b.status.utilizationBps / 10_000}
                tone={
                  b.status.state === 'exceeded'
                    ? 'negative'
                    : b.status.state === 'ok'
                      ? 'ink'
                      : 'warning'
                }
              />
              <Text className="text-sm text-muted">
                {formatMoney(b.status.dailyAllowance)}/day for {b.status.remainingDays} days ·
                projected {formatMoney(b.status.projectedSpend)} by month-end
              </Text>
            </Card>
          </Pressable>
        );
      })}
      <Button
        label="Add budget"
        variant="primary"
        icon="plus"
        onPress={() => {
          setEditing('new');
          setCategoryId(null);
          setAmount('');
          save.reset();
        }}
      />

      <Sheet
        visible={editing !== null}
        onClose={() => setEditing(null)}
        title={
          editing === 'new'
            ? 'New budget'
            : `Edit · ${editing ? categoryName(editing.categoryId) : ''}`
        }
      >
        {editing === 'new' ? (
          <View className="gap-1.5">
            <Label>Category</Label>
            <Text className="text-xs text-muted">&quot;None&quot; = a limit for all spending.</Text>
            <CategoryChips
              categories={categories.data ?? []}
              kind="expense"
              value={categoryId}
              onChange={setCategoryId}
            />
          </View>
        ) : null}
        <Field
          label="Monthly limit (₱)"
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="0.00"
        />
        {save.error ? (
          <Text className="text-sm text-negative">{errorMessage(save.error)}</Text>
        ) : null}
        <Button
          label="Save"
          variant="dark"
          loading={save.isPending}
          onPress={() => save.mutate()}
        />
        {editing && editing !== 'new' ? (
          <Button label="Delete budget" variant="danger" onPress={() => remove(editing)} />
        ) : null}
      </Sheet>
    </Screen>
  );
}
