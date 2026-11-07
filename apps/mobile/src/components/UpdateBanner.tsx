import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { openDownload, useAppUpdate } from '@/lib/updates';
import { Banner, Text } from './ui';

/** Shown on Home when a newer APK has been published (dismissable for this session). */
export function UpdateBanner() {
  const { update, installed } = useAppUpdate();
  const [dismissed, setDismissed] = useState<string | null>(null);
  if (!update || dismissed === update.version) return null;
  return (
    <Banner
      tone="info"
      icon="sparkles"
      title={`Money Money ${update.version} is available`}
      body={`You have ${installed}. The update installs over this app and keeps your data.`}
      action={
        <View className="flex-row items-center gap-4">
          <Pressable accessibilityRole="button" onPress={() => openDownload(update)} hitSlop={8}>
            <Text weight="semibold" className="text-sm text-info">
              Download update
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => setDismissed(update.version)}
            hitSlop={8}
          >
            <Text className="text-sm text-muted">Later</Text>
          </Pressable>
        </View>
      }
    />
  );
}
