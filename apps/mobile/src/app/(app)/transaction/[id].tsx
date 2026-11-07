import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { displayAmount, SyncBadge } from '@/components/TransactionRow';
import { Banner, Button, Card, Divider, EmptyState, Label, Row, Text } from '@/components/ui';
import { useLocalAccounts, useLocalCategories } from '@/hooks/useLocalData';
import { useLocalQuery } from '@/hooks/useLocalQuery';
import { formatDate, TYPE_LABEL } from '@/lib/format';
import {
  discardTransactionChanges,
  removeTransaction,
  retryTransaction,
  useSyncStatus,
} from '@/lib/sync/runtime';

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <Row className="min-h-11 justify-between gap-4 py-1">
      <Text className="text-muted">{label}</Text>
      <Text weight="medium" className="flex-1 text-right">
        {value}
      </Text>
    </Row>
  );
}

export default function TransactionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tx = useLocalQuery((s) => s.getTransaction(id), [id]);
  const pendingOps = useLocalQuery(
    async (s) => (await s.listOutbox()).filter((o) => o.entityId === id),
    [id],
  );
  const accounts = useLocalAccounts();
  const categories = useLocalCategories();
  const status = useSyncStatus();
  const [busy, setBusy] = useState(false);

  const row = tx.data;
  if (!tx.loading && !row) {
    return (
      <Screen title="Transaction" back>
        <EmptyState
          icon="receipt"
          title="Not on this device"
          body="It may have been deleted or not synced yet."
        />
      </Screen>
    );
  }
  if (!row)
    return (
      <Screen title="Transaction" back>
        {null}
      </Screen>
    );

  const accountName = (aid: string | null) =>
    (aid && accounts.data?.accounts.find((a) => a.id === aid)?.name) || 'Unknown account';
  const category = row.categoryId
    ? categories.data?.find((c) => c.id === row.categoryId)?.name
    : null;
  const amount = displayAmount(row);
  const lastError = pendingOps.data?.find((o) => o.lastError)?.lastError;

  const confirmDelete = () =>
    Alert.alert('Delete transaction?', 'It will be removed from all devices once synced.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          await removeTransaction(row.id);
          router.back();
        },
      },
    ]);

  return (
    <Screen title={row.description || TYPE_LABEL[row.type]} back>
      <Card className="items-center gap-2 py-6">
        <Text weight="bold" tabular className={`text-display ${amount.className}`}>
          {amount.text}
        </Text>
        <Row className="gap-2">
          <Text className="text-muted">{TYPE_LABEL[row.type]}</Text>
          <SyncBadge tx={row} />
        </Row>
      </Card>

      {row.syncState === 'pending' ? (
        <Banner
          tone="warning"
          icon="cloud-upload"
          title={row.deletedAt ? 'Deletion not synced yet' : 'Saved on this phone — not synced yet'}
          body={
            status.online
              ? `Waiting for the server to confirm.${lastError ? ` Last attempt: ${lastError}` : ''}`
              : "You're offline. It will sync automatically when you're back online."
          }
        />
      ) : null}
      {row.syncState === 'failed' ? (
        <Banner
          tone="negative"
          icon="circle-alert"
          title="The server rejected this change"
          body={`${row.syncError ?? 'Unknown reason'}. Fix it and retry, or discard the local change.`}
          action={
            <>
              <Button label="Retry" variant="secondary" onPress={() => retryTransaction(row.id)} />
              <Button
                label="Discard"
                variant="danger"
                onPress={async () => {
                  await discardTransactionChanges(row.id);
                  router.back();
                }}
              />
            </>
          }
        />
      ) : null}

      <Card className="gap-0">
        <Detail label="Date" value={formatDate(row.occurredOn)} />
        <Divider />
        {row.type === 'transfer' ? (
          <>
            <Detail label="From" value={accountName(row.accountId)} />
            <Divider />
            <Detail label="To" value={accountName(row.counterAccountId)} />
          </>
        ) : (
          <>
            <Detail label="Account" value={accountName(row.accountId)} />
            <Divider />
            <Detail label="Category" value={category ?? 'None'} />
          </>
        )}
        {row.notes ? (
          <>
            <Divider />
            <View className="gap-1 py-2">
              <Label>Note</Label>
              <Text>{row.notes}</Text>
            </View>
          </>
        ) : null}
        {row.scheduledEventId ? (
          <>
            <Divider />
            <Detail
              label="From plan"
              value={row.occurrenceDate ? formatDate(row.occurrenceDate) : 'Yes'}
            />
          </>
        ) : null}
      </Card>

      {!row.deletedAt ? (
        <View className="gap-2">
          {row.type === 'adjustment' ? (
            <Text className="text-sm text-muted">
              Balance adjustments can be edited on the web app.
            </Text>
          ) : (
            <Button
              label="Edit"
              variant="dark"
              icon="pencil"
              onPress={() => router.push({ pathname: '/quick-add', params: { id: row.id } })}
            />
          )}
          <Button
            label="Delete"
            variant="danger"
            icon="trash"
            loading={busy}
            onPress={confirmDelete}
          />
        </View>
      ) : null}
    </Screen>
  );
}
