import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { errorMessage, getApi } from '@/lib/api';
import { syncNow } from '@/lib/sync/runtime';
import { useLocalSettings } from '@/hooks/useLocalData';
import { Text } from './ui';

/** Persistent while the server says demo data is loaded (financial honesty rule 6). */
export function DemoBanner() {
  const { data: settings } = useLocalSettings();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  if (!settings?.demoMode) return null;

  const remove = () => {
    Alert.alert('Remove demo data?', 'All demo accounts, transactions and plans will be deleted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await getApi().demo.clear();
            await syncNow({ force: true });
            await qc.invalidateQueries();
          } catch (err) {
            Alert.alert('Could not remove demo data', errorMessage(err));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  return (
    <View
      accessibilityRole="summary"
      className="mx-4 mb-1 flex-row items-center justify-between rounded-button bg-ink px-3 py-2"
    >
      <View className="flex-row items-center gap-2">
        <View className="h-2 w-2 rounded-full bg-accent" />
        <Text weight="semibold" className="text-sm text-card">
          Demo data
        </Text>
        <Text className="text-xs text-subtle">Not your real money</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={remove}
        hitSlop={8}
        className="min-h-9 justify-center px-1"
      >
        <Text weight="semibold" className="text-sm text-accent">
          {busy ? 'Removing…' : 'Remove'}
        </Text>
      </Pressable>
    </View>
  );
}
