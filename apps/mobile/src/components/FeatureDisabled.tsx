import { router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Button, Card, Text } from '@/components/ui';

export function FeatureDisabledScreen({
  title,
  featureName,
  description,
}: {
  title: string;
  featureName: string;
  description: string;
}) {
  return (
    <Screen title={title}>
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
