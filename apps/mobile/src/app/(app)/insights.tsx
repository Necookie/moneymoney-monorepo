import type { Alert as AlertDto } from '@mm/api-client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import {
  Banner,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorCard,
  Row,
  Segmented,
  Skeleton,
  Text,
} from '@/components/ui';
import { useCachedQuery } from '@/hooks/useCachedQuery';
import { errorMessage, getApi } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/format';
import { colors } from '@/lib/theme';

const SEVERITY = {
  critical: { label: 'Critical', tone: 'negative', color: colors.negative },
  warning: { label: 'Warning', tone: 'warning', color: colors.warning },
  info: { label: 'Info', tone: 'muted', color: colors.info },
} as const;

const ORDER = { critical: 0, warning: 1, info: 2 } as const;

function AlertCard({
  alert,
  onDismiss,
  dismissing,
}: {
  alert: AlertDto;
  onDismiss?: () => void;
  dismissing: boolean;
}) {
  const s = SEVERITY[alert.severity];
  return (
    <Card className="gap-2">
      <Row className="gap-2">
        <Icon
          name={alert.severity === 'info' ? 'info' : 'triangle-alert'}
          size={18}
          color={s.color}
        />
        <Text weight="semibold" className="flex-1">
          {alert.title}
        </Text>
        <Chip label={s.label} tone={s.tone} />
      </Row>
      <Text className="text-sm text-ink-soft">{alert.reason}</Text>
      {alert.amount !== null || alert.affectedDate ? (
        <Text tabular className="text-sm text-muted">
          {[
            alert.amount !== null ? formatMoney(alert.amount) : null,
            alert.affectedDate ? formatDate(alert.affectedDate) : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      ) : null}
      <View className="rounded-input bg-canvas p-3">
        <Text className="text-sm">
          <Text weight="semibold" className="text-sm">
            Suggestion:{' '}
          </Text>
          {alert.suggestion}
        </Text>
      </View>
      {onDismiss ? (
        <Button label="Dismiss" variant="secondary" loading={dismissing} onPress={onDismiss} />
      ) : null}
    </Card>
  );
}

export default function InsightsScreen() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<'active' | 'dismissed'>('active');
  const alerts = useCachedQuery(['alerts', status], () => getApi().alerts.list(status));
  const dismiss = useMutation({
    mutationFn: (id: string) => getApi().alerts.dismiss(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['alerts'] });
      await qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
  const list = [...(alerts.data?.data ?? [])].sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);

  return (
    <Screen
      title="Insights"
      back
      refreshing={alerts.isRefetching}
      onRefresh={() => alerts.refetch()}
    >
      <Segmented
        options={[
          { value: 'active', label: 'Active' },
          { value: 'dismissed', label: 'Dismissed' },
        ]}
        value={status}
        onChange={setStatus}
      />
      {alerts.data?.fromCache ? (
        <Banner tone="neutral" icon="offline" title="Offline — last saved alerts" />
      ) : null}
      {alerts.isError && !alerts.data ? (
        <ErrorCard message={errorMessage(alerts.error)} onRetry={() => alerts.refetch()} />
      ) : null}
      {dismiss.error ? (
        <Text className="text-sm text-negative">{errorMessage(dismiss.error)}</Text>
      ) : null}
      {alerts.isLoading ? <Skeleton className="h-32 w-full" /> : null}
      {alerts.data && list.length === 0 ? (
        <EmptyState
          icon="shield-check"
          title={status === 'active' ? 'All clear' : 'Nothing dismissed'}
          body={
            status === 'active'
              ? 'No warnings about your budgets, buffer or upcoming bills.'
              : undefined
          }
        />
      ) : null}
      {list.map((a) => (
        <AlertCard
          key={a.id}
          alert={a}
          dismissing={dismiss.isPending && dismiss.variables === a.id}
          onDismiss={status === 'active' ? () => dismiss.mutate(a.id) : undefined}
        />
      ))}
    </Screen>
  );
}
