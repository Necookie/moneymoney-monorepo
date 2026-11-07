import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Tabs, type BottomTabBarProps } from 'expo-router/js-tabs';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '@/components/Icon';
import { Text } from '@/components/ui';
import { colors } from '@/lib/theme';

const TABS: Record<string, { label: string; icon: IconName }> = {
  index: { label: 'Home', icon: 'house' },
  activity: { label: 'Activity', icon: 'receipt' },
  plan: { label: 'Plan', icon: 'calendar' },
  more: { label: 'More', icon: 'menu' },
};

/**
 * Bottom tab bar with a prominent centre "Quick add" action. The centre slot is an action
 * (opens the entry sheet), not a destination, so it is rendered separately from the routes.
 */
function TabBar({ state, emitter, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const routes = state.routes.filter((r) => r.name in TABS);
  const left = routes.slice(0, 2);
  const right = routes.slice(2);

  const renderTab = (route: (typeof routes)[number]) => {
    const meta = TABS[route.name]!;
    const focused = state.routes[state.index]?.key === route.key;
    return (
      <Pressable
        key={route.key}
        accessibilityRole="tab"
        accessibilityLabel={meta.label}
        accessibilityState={{ selected: focused }}
        onPress={() => {
          const event = emitter.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            Haptics.selectionAsync().catch(() => undefined);
            navigateToTab(route.key);
          }
        }}
        className="flex-1 items-center justify-center gap-1"
        style={{ minHeight: 56 }}
      >
        <View className="items-center">
          <Icon
            name={meta.icon}
            size={22}
            color={focused ? colors.ink : colors.muted}
            strokeWidth={focused ? 2 : 1.75}
          />
          <View
            className="mt-1 h-1 w-5 rounded-full"
            style={{ backgroundColor: focused ? colors.accent : 'transparent' }}
          />
        </View>
        <Text
          weight={focused ? 'semibold' : 'regular'}
          className={`text-xs ${focused ? 'text-ink' : 'text-muted'}`}
        >
          {meta.label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View
      className="flex-row items-center border-t border-border bg-card px-2"
      style={{ paddingBottom: Math.max(insets.bottom, 8), paddingTop: 6 }}
    >
      {left.map(renderTab)}
      <View className="flex-1 items-center">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Quick add transaction"
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
            router.push('/quick-add');
          }}
          className="h-14 w-14 items-center justify-center rounded-full bg-accent active:bg-accent-hover"
          style={{ borderWidth: 3, borderColor: colors.ink, marginTop: -18 }}
        >
          <Icon name="plus" size={26} color={colors.accentInk} strokeWidth={2.5} />
        </Pressable>
      </View>
      {right.map(renderTab)}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="activity" />
      <Tabs.Screen name="plan" />
      <Tabs.Screen name="more" />
    </Tabs>
  );
}
