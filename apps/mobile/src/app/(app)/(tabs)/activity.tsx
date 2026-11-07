import type { Account, Category } from '@mm/api-client';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DemoBanner } from '@/components/DemoBanner';
import { Icon } from '@/components/Icon';
import { SyncIndicator } from '@/components/SyncIndicator';
import { TransactionRow } from '@/components/TransactionRow';
import { Banner, Button, Chip, Divider, EmptyState, Row, Text } from '@/components/ui';
import { useLocalAccounts, useLocalCategories } from '@/hooks/useLocalData';
import { useLocalQuery } from '@/hooks/useLocalQuery';
import { countByType, queryTransactions, type TypeFilter } from '@/lib/db/queries';
import { relativeDay, today } from '@/lib/format';
import { dismissNotices, syncNow, useSyncStatus } from '@/lib/sync/runtime';
import type { LocalTransaction } from '@/lib/sync/types';
import { colors, fonts } from '@/lib/theme';

const FILTERS: { value: TypeFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'expense', label: 'Expenses' },
  { value: 'income', label: 'Income' },
  { value: 'transfer', label: 'Transfers' },
  { value: 'refund', label: 'Refunds' },
];

type ListItem = { kind: 'header'; date: string } | { kind: 'tx'; tx: LocalTransaction };

export default function ActivityScreen() {
  const [type, setType] = useState<TypeFilter>('all');
  const [q, setQ] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const status = useSyncStatus();
  const accounts = useLocalAccounts();
  const categories = useLocalCategories();
  const list = useLocalQuery((s) => queryTransactions(s.db, { type, q, limit: 500 }), [type, q]);
  const counts = useLocalQuery((s) => countByType(s.db), []);

  const accountMap = useMemo(
    () => new Map<string, Account>((accounts.data?.accounts ?? []).map((a) => [a.id, a])),
    [accounts.data],
  );
  const categoryMap = useMemo(
    () => new Map<string, Category>((categories.data ?? []).map((c) => [c.id, c])),
    [categories.data],
  );

  const items = useMemo<ListItem[]>(() => {
    const out: ListItem[] = [];
    let last = '';
    for (const tx of list.data ?? []) {
      if (tx.occurredOn !== last) {
        out.push({ kind: 'header', date: tx.occurredOn });
        last = tx.occurredOn;
      }
      out.push({ kind: 'tx', tx });
    }
    return out;
  }, [list.data]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await syncNow({ force: true });
    } finally {
      setRefreshing(false);
    }
  };

  const t = today();

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-canvas">
      <DemoBanner />
      <Row className="justify-between px-4 pb-2 pt-2">
        <Text weight="semibold" className="text-2xl">
          Activity
        </Text>
        <SyncIndicator />
      </Row>
      <View className="gap-2 px-4 pb-2">
        <View className="min-h-12 flex-row items-center gap-2 rounded-input border border-border-strong bg-card px-3">
          <Icon name="search" size={18} color={colors.muted} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search description, category, account"
            placeholderTextColor={colors.subtle}
            className="flex-1 text-base text-ink"
            style={{ fontFamily: fonts.regular }}
            returnKeyType="search"
            accessibilityLabel="Search transactions"
          />
          {q ? (
            <Text
              className="text-sm text-muted"
              onPress={() => setQ('')}
              accessibilityRole="button"
            >
              Clear
            </Text>
          ) : null}
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2"
        >
          {FILTERS.map((f) => (
            <Chip
              key={f.value}
              label={f.label}
              count={counts.data?.[f.value]}
              selected={type === f.value}
              onPress={() => setType(f.value)}
            />
          ))}
        </ScrollView>
      </View>

      {status.notices.length > 0 ? (
        <View className="px-4 pb-2">
          <Banner
            tone="warning"
            icon="triangle-alert"
            title={`${status.notices.length} change${status.notices.length === 1 ? '' : 's'} not applied as entered`}
            body={status.notices
              .slice(0, 3)
              .map(
                (n) =>
                  `${n.kind === 'conflict' ? 'Kept the server copy' : 'Rejected'} — ${n.message}`,
              )
              .join('\n')}
            action={<Button label="Dismiss" variant="secondary" onPress={() => dismissNotices()} />}
          />
        </View>
      ) : null}

      <FlatList
        data={items}
        keyExtractor={(item) => (item.kind === 'header' ? `h${item.date}` : item.tx.id)}
        contentContainerClassName="px-4 pb-32"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={colors.ink}
            colors={[colors.ink]}
          />
        }
        renderItem={({ item }) =>
          item.kind === 'header' ? (
            <View className="pb-1 pt-4">
              <Text weight="semibold" className="text-sm text-muted">
                {relativeDay(item.date, t)}
              </Text>
              <Divider className="mt-1" />
            </View>
          ) : (
            <TransactionRow
              tx={item.tx}
              accounts={accountMap}
              categories={categoryMap}
              onPress={() =>
                router.push({ pathname: '/transaction/[id]', params: { id: item.tx.id } })
              }
            />
          )
        }
        ListEmptyComponent={
          list.loading ? undefined : q || type !== 'all' ? (
            <EmptyState icon="search" title="No matches" body="Try another search or filter." />
          ) : (
            <EmptyState
              icon="receipt"
              title="No transactions yet"
              body="Log your first expense or income. It saves instantly, even offline."
              action={
                <Button
                  label="Quick add"
                  variant="primary"
                  icon="plus"
                  onPress={() => router.push('/quick-add')}
                />
              }
            />
          )
        }
      />
    </SafeAreaView>
  );
}
