import { router, type Href } from 'expo-router';
import { View } from 'react-native';
import type { IconName } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { SyncIndicator } from '@/components/SyncIndicator';
import { Card, Divider, Label, ListRow, Text } from '@/components/ui';

const SECTIONS: {
  title: string;
  items: { href: Href; title: string; subtitle: string; icon: IconName }[];
}[] = [
  {
    title: 'Money',
    items: [
      {
        href: '/budgets',
        title: 'Budgets',
        subtitle: 'Monthly limits and daily allowance',
        icon: 'chart-pie',
      },
      { href: '/goals', title: 'Goals', subtitle: 'Savings targets and allocations', icon: 'flag' },
      {
        href: '/accounts',
        title: 'Accounts',
        subtitle: 'Balances, including unsynced changes',
        icon: 'wallet',
      },
    ],
  },
  {
    title: 'Look ahead',
    items: [
      {
        href: '/forecast',
        title: 'Forecast',
        subtitle: 'Projected balance and what-if scenarios',
        icon: 'chart-line',
      },
      {
        href: '/afford',
        title: 'Can I afford this?',
        subtitle: 'Check a purchase against your obligations',
        icon: 'shield-check',
      },
      {
        href: '/insights',
        title: 'Insights & alerts',
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
  return (
    <Screen title="More" right={<SyncIndicator />}>
      {SECTIONS.map((s) => (
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
