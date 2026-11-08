import type { AppFeature } from '@mm/types';
import { router, type Href } from 'expo-router';
import { View } from 'react-native';
import type { IconName } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { SyncIndicator } from '@/components/SyncIndicator';
import { Card, Divider, Label, ListRow, Text } from '@/components/ui';
import { useLocalSettings } from '@/hooks/useLocalData';

/** Mirrors the web sidebar order: Forecast, Budgets, Goals, Accounts, Insights, Settings. */
const SECTIONS: {
  title: string;
  items: { href: Href; title: string; subtitle: string; icon: IconName; feature?: AppFeature }[];
}[] = [
  {
    title: 'Look ahead',
    items: [
      {
        feature: 'forecast',
        href: '/forecast',
        title: 'Forecast',
        subtitle: 'Projected balance and what-if scenarios',
        icon: 'chart-line',
      },
      {
        feature: 'afford',
        href: '/afford',
        title: 'Can I afford this?',
        subtitle: 'Check a purchase against your obligations',
        icon: 'shield-check',
      },
    ],
  },
  {
    title: 'Money',
    items: [
      {
        feature: 'budgets',
        href: '/budgets',
        title: 'Budgets',
        subtitle: 'Monthly limits and daily allowance',
        icon: 'chart-pie',
      },
      {
        feature: 'goals',
        href: '/goals',
        title: 'Goals',
        subtitle: 'Savings targets and allocations',
        icon: 'flag',
      },
      {
        feature: 'accounts',
        href: '/accounts',
        title: 'Accounts',
        subtitle: 'Balances, including unsynced changes',
        icon: 'wallet',
      },
      {
        feature: 'insights',
        href: '/insights',
        title: 'Insights',
        subtitle: 'Warnings about pace, buffers and bills',
        icon: 'triangle-alert',
      },
    ],
  },
  {
    title: 'App',
    items: [
      {
        href: '/settings',
        title: 'Settings',
        subtitle: 'Security, notifications, sync, demo data',
        icon: 'settings',
      },
    ],
  },
];

export default function MoreScreen() {
  const settings = useLocalSettings();
  const features = settings.data?.features;

  const activeSections = SECTIONS.map((s) => ({
    ...s,
    items: s.items.filter((item) => !item.feature || features?.[item.feature] !== false),
  })).filter((s) => s.items.length > 0);

  return (
    <Screen title="More" right={<SyncIndicator />}>
      {activeSections.map((s) => (
        <View key={s.title} className="gap-1.5">
          <Label className="px-1 pt-2">{s.title}</Label>
          <Card className="gap-0 py-1">
            {s.items.map((item, i) => (
              <View key={item.title}>
                {i > 0 ? <Divider /> : null}
                <ListRow
                  icon={item.icon}
                  title={item.title}
                  subtitle={item.subtitle}
                  onPress={() => router.push(item.href)}
                />
              </View>
            ))}
          </Card>
        </View>
      ))}
      <Text className="pt-4 text-center text-xs text-muted">
        money money. · know your money before you spend it
      </Text>
    </Screen>
  );
}
