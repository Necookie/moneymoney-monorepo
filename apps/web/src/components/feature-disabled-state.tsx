import Link from 'next/link';
import { EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';

export function FeatureDisabledState({
  featureName,
  description,
}: {
  featureName: string;
  description: string;
}) {
  return (
    <EmptyState
      icon="settings"
      title={`${featureName} is turned off`}
      description={`You turned off ${featureName} in Settings. ${description}`}
      action={
        <Button variant="outline" asChild>
          <Link href="/settings">Open Settings</Link>
        </Button>
      }
    />
  );
}
