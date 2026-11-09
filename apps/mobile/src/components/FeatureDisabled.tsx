import type { AppFeature } from '@mm/types';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Screen } from '@/components/Screen';
import { Button, Card, Text } from '@/components/ui';
import { useLocalSettings } from '@/hooks/useLocalData';

export function FeatureDisabledScreen({
  title,
  featureName,
  description,
  back = true,
}: {
  title: string;
  featureName: string;
  description: string;
  /** Show a back button (stack screens); tab roots have nothing to go back to. */
  back?: boolean;
}) {
  return (
    <Screen title={title} back={back}>
      <Card className="items-center gap-3 py-8 text-center">
        <Text weight="bold" className="text-xl text-ink">
          {featureName} is turned off
        </Text>
        <Text className="text-center text-sm text-muted">
          You turned off {featureName} in Settings. {description}
        </Text>
        <Button
          label="Open Settings"
          variant="secondary"
          onPress={() => router.push('/settings')}
        />
      </Card>
    </Screen>
  );
}

/**
 * Renders `children` only while `feature` is on. Gate in a wrapper (never with an early return
 * inside the screen itself): the flag can flip while a screen is mounted, and returning before
 * the screen's own hooks would change the hook count and crash React.
 */
export function FeatureGate({
  feature,
  children,
  ...disabled
}: {
  feature: AppFeature;
  title: string;
  featureName: string;
  description: string;
  back?: boolean;
  children: ReactNode;
}) {
  const settings = useLocalSettings();
  if (settings.data?.features?.[feature] === false) return <FeatureDisabledScreen {...disabled} />;
  return <>{children}</>;
}
