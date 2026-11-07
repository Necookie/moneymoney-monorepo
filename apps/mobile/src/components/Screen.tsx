import { type ReactNode } from 'react';
import { router } from 'expo-router';
import { RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/lib/theme';
import { DemoBanner } from './DemoBanner';
import { IconButton, Text } from './ui';

export interface ScreenProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  /** Header accessory (right side). */
  right?: ReactNode;
  back?: boolean;
  onBack?: () => void;
  refreshing?: boolean;
  onRefresh?: () => void;
  scroll?: boolean;
  /** Extra content above the title (banners). */
  top?: ReactNode;
  contentClassName?: string;
}

export function Screen({
  children,
  title,
  subtitle,
  right,
  back,
  onBack,
  refreshing,
  onRefresh,
  scroll = true,
  top,
  contentClassName,
}: ScreenProps) {
  const header = (title || right || back) && (
    <View className="flex-row items-center px-4 pb-2 pt-2" style={{ minHeight: 52 }}>
      {back ? (
        <IconButton
          icon="arrow-left"
          label="Back"
          onPress={onBack ?? (() => router.back())}
          className="-ml-2 mr-1"
        />
      ) : null}
      <View className="flex-1">
        {title ? (
          <Text weight="semibold" className="text-2xl" numberOfLines={1}>
            {title}
          </Text>
        ) : null}
        {subtitle ? <Text className="text-sm text-muted">{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-canvas">
      <DemoBanner />
      {top}
      {header}
      {scroll ? (
        <ScrollView
          className="flex-1"
          contentContainerClassName={`px-4 pb-32 gap-3 ${contentClassName ?? ''}`}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={!!refreshing}
                onRefresh={onRefresh}
                tintColor={colors.ink}
                colors={[colors.ink]}
              />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
      ) : (
        <View className={`flex-1 ${contentClassName ?? ''}`}>{children}</View>
      )}
    </SafeAreaView>
  );
}
