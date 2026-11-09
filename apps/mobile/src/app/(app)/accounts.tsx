import type { AccountType } from '@mm/types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { DateField } from '@/components/pickers';
import { Screen } from '@/components/Screen';
import { FeatureGate } from '@/components/FeatureDisabled';
import {
  Button,
  Card,
  Chip,
  Divider,
  EmptyState,
  Field,
  Label,
  Money,
  Row,
  Segmented,
  Sheet,
  Text,
} from '@/components/ui';
import { useLocalAccounts } from '@/hooks/useLocalData';
import { errorMessage, getApi } from '@/lib/api';
import { formatMoney, timeAgo, today, tryParseMoney } from '@/lib/format';
import { syncNow, useSyncStatus } from '@/lib/sync/runtime';

const TYPES: { value: AccountType; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank', label: 'Bank' },
  { value: 'ewallet', label: 'E-wallet' },
  { value: 'savings', label: 'Savings' },
  { value: 'credit', label: 'Credit card' },
];
const TYPE_LABEL = Object.fromEntries(TYPES.map((t) => [t.value, t.label])) as Record<
  AccountType,
  string
>;

function NewAccountSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('bank');
  const [opening, setOpening] = useState('');
  const [owed, setOwed] = useState<'owe' | 'credit'>('owe');
  const [date, setDate] = useState(today());
  const create = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error('Name the account.');
      const value = opening.trim() ? tryParseMoney(opening) : 0;
      if (value === null || value < 0) throw new Error('Opening balance is not a valid amount.');
      // Credit balances are stored signed: owing money is negative.
      const signed = type === 'credit' && owed === 'owe' ? -value : value;
      return getApi().accounts.create({
        name: name.trim(),
        type,
        openingBalance: signed,
        openingDate: date,
      });
    },
    onSuccess: async () => {
      setName('');
      setOpening('');
      onClose();
      await syncNow({ force: true }).catch(() => undefined);
      await qc.invalidateQueries();
    },
  });
  return (
    <Sheet visible={visible} onClose={onClose} title="New account">
      <Field
        label="Name"
        value={name}
        onChangeText={setName}
        placeholder="e.g. BPI Savings"
        maxLength={120}
      />
      <View className="flex-row flex-wrap gap-2">
        {TYPES.map((t) => (
          <Chip
            key={t.value}
            label={t.label}
            selected={type === t.value}
            onPress={() => setType(t.value)}
          />
        ))}
      </View>
      <Field
        label={type === 'credit' ? 'Current balance (₱)' : 'Opening balance (₱)'}
        value={opening}
        onChangeText={setOpening}
        keyboardType="decimal-pad"
        placeholder="0.00"
      />
      {type === 'credit' ? (
        <Segmented
          options={[
            { value: 'owe', label: 'I owe this' },
            { value: 'credit', label: 'Card is in credit' },
          ]}
          value={owed}
          onChange={setOwed}
        />
      ) : null}
      <DateField label="As of" value={date} onChange={setDate} />
      {create.error ? (
        <Text className="text-sm text-negative">{errorMessage(create.error)}</Text>
      ) : null}
      <Button
        label="Create account"
        variant="dark"
        loading={create.isPending}
        onPress={() => create.mutate()}
      />
      <Text className="text-xs text-muted">Creating accounts needs a connection.</Text>
    </Sheet>
  );
}

export default function AccountsScreen() {
  return (
    <FeatureGate
      feature="accounts"
      title="Accounts"
      featureName="Accounts"
      description="Enable Accounts in Settings to view balances and manage accounts."
    >
      <AccountsContent />
    </FeatureGate>
  );
}

function AccountsContent() {
  const local = useLocalAccounts();
  const status = useSyncStatus();
  const [creating, setCreating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const accounts = local.data?.accounts ?? [];
  const open = accounts.filter((a) => !a.archived);
  const archived = accounts.filter((a) => a.archived);

  let assets = 0;
  let liabilities = 0;
  for (const a of accounts) {
    if (a.type === 'credit') liabilities -= a.balance;
    else assets += a.balance;
  }

  return (
    <Screen
      title="Accounts"
      back
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        try {
          await syncNow({ force: true });
        } finally {
          setRefreshing(false);
        }
      }}
    >
      <Card className="gap-2">
        <Label>Net position</Label>
        <Money value={local.data?.net ?? 0} className="text-3xl" tone="auto" weight="bold" />
        <Row className="gap-4">
          <Text className="text-sm text-muted">Assets {formatMoney(assets)}</Text>
          <Text className="text-sm text-muted">Owed {formatMoney(liabilities)}</Text>
        </Row>
        {local.data?.unsyncedCount ? (
          <Text className="text-xs text-warning">
            Includes {local.data.unsyncedCount} unsynced change
            {local.data.unsyncedCount === 1 ? '' : 's'} from this phone.
          </Text>
        ) : null}
        <Text className="text-xs text-muted">
          Server balances as of the last sync ({timeAgo(status.lastSyncedAt)}).
        </Text>
      </Card>

      {!local.loading && accounts.length === 0 ? (
        <EmptyState
          icon="wallet"
          title="No accounts yet"
          body="Add the places your money lives: cash, bank, e-wallet, card."
        />
      ) : null}

      {open.length ? (
        <Card className="gap-0 py-1">
          {open.map((a, i) => (
            <View key={a.id}>
              {i > 0 ? <Divider /> : null}
              <Row className="min-h-16 justify-between gap-3 py-2">
                <View className="flex-1">
                  <Text weight="medium" numberOfLines={1}>
                    {a.name}
                  </Text>
                  <Text className="text-sm text-muted">
                    {TYPE_LABEL[a.type]}
                    {a.isDemo ? ' · demo' : ''}
                  </Text>
                </View>
                <View className="items-end">
                  <Money value={a.balance} tone={a.balance < 0 ? 'negative' : 'ink'} />
                  {a.unsyncedDelta !== 0 ? (
                    <Text tabular className="text-xs text-warning">
                      {formatMoney(a.unsyncedDelta, { signed: true })} unsynced
                    </Text>
                  ) : null}
                </View>
              </Row>
            </View>
          ))}
        </Card>
      ) : null}

      {archived.length ? (
        <>
          <Label className="px-1 pt-2">Archived</Label>
          <Card className="gap-0 py-1">
            {archived.map((a) => (
              <Row key={a.id} className="min-h-12 justify-between py-2">
                <Text className="text-muted">{a.name}</Text>
                <Money value={a.balance} tone="muted" />
              </Row>
            ))}
          </Card>
        </>
      ) : null}

      <Button label="Add account" variant="primary" icon="plus" onPress={() => setCreating(true)} />
      <NewAccountSheet visible={creating} onClose={() => setCreating(false)} />
    </Screen>
  );
}
