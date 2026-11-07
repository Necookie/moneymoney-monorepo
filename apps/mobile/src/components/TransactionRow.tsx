import type { Account, Category } from '@mm/api-client';
import { Pressable, View } from 'react-native';
import { formatMoney } from '@/lib/format';
import type { LocalTransaction } from '@/lib/sync/types';
import { colors } from '@/lib/theme';
import { Icon, type IconName } from './Icon';
import { Text } from './ui';

const TYPE_ICON: Record<LocalTransaction['type'], IconName> = {
  expense: 'arrow-up-right',
  income: 'arrow-down-left',
  refund: 'arrow-down-left',
  transfer: 'arrow-left-right',
  adjustment: 'pencil',
};

/** Signed display amount. Transfers are neither income nor spending: shown unsigned & neutral. */
export function displayAmount(tx: Pick<LocalTransaction, 'type' | 'amount'>) {
  switch (tx.type) {
    case 'expense':
      return { text: formatMoney(-Math.abs(tx.amount)), className: 'text-ink' };
    case 'income':
    case 'refund':
      return {
        text: formatMoney(Math.abs(tx.amount), { signed: true }),
        className: 'text-positive',
      };
    case 'transfer':
      return { text: formatMoney(Math.abs(tx.amount)), className: 'text-muted' };
    case 'adjustment':
      return {
        text: formatMoney(tx.amount, { signed: true }),
        className: tx.amount < 0 ? 'text-ink' : 'text-positive',
      };
  }
}

export function SyncBadge({ tx }: { tx: Pick<LocalTransaction, 'syncState' | 'deletedAt'> }) {
  if (tx.syncState === 'synced') return null;
  const failed = tx.syncState === 'failed';
  return (
    <View
      className={`flex-row items-center gap-1 rounded-full px-1.5 py-0.5 ${failed ? 'bg-negative-soft' : 'bg-warning-soft'}`}
    >
      <Icon
        name={failed ? 'circle-alert' : 'cloud-upload'}
        size={11}
        color={failed ? colors.negative : colors.warning}
        strokeWidth={2}
      />
      <Text weight="medium" className={`text-xs ${failed ? 'text-negative' : 'text-warning'}`}>
        {failed ? 'Failed' : tx.deletedAt ? 'Deleting' : 'Pending'}
      </Text>
    </View>
  );
}

export function TransactionRow({
  tx,
  accounts,
  categories,
  onPress,
}: {
  tx: LocalTransaction;
  accounts: Map<string, Account>;
  categories: Map<string, Category>;
  onPress?: () => void;
}) {
  const amount = displayAmount(tx);
  const account = accounts.get(tx.accountId)?.name ?? 'Unknown account';
  const meta =
    tx.type === 'transfer'
      ? `${account} → ${(tx.counterAccountId && accounts.get(tx.counterAccountId)?.name) || 'Unknown'}`
      : [tx.categoryId ? categories.get(tx.categoryId)?.name : null, account]
          .filter(Boolean)
          .join(' · ');
  const title =
    tx.description ||
    (tx.categoryId ? categories.get(tx.categoryId)?.name : null) ||
    (tx.type === 'transfer' ? 'Transfer' : tx.type === 'income' ? 'Income' : 'Expense');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${amount.text}${tx.syncState !== 'synced' ? `, ${tx.syncState}` : ''}`}
      onPress={onPress}
      className="min-h-16 flex-row items-center gap-3 py-2.5 active:opacity-70"
    >
      <View className="h-10 w-10 items-center justify-center rounded-full bg-canvas">
        <Icon name={TYPE_ICON[tx.type]} size={18} color={colors.inkSoft} />
      </View>
      <View className="flex-1 gap-0.5">
        <Text weight="medium" numberOfLines={1}>
          {title}
        </Text>
        <View className="flex-row items-center gap-1.5">
          <Text className="shrink text-sm text-muted" numberOfLines={1}>
            {meta}
          </Text>
          <SyncBadge tx={tx} />
        </View>
      </View>
      <Text weight="semibold" tabular className={amount.className}>
        {amount.text}
      </Text>
    </Pressable>
  );
}
