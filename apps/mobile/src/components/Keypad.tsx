import * as Haptics from 'expo-haptics';
import { Pressable, View } from 'react-native';
import { colors } from '@/lib/theme';
import { applyKey } from '@/lib/amountInput';
import { Icon } from './Icon';
import { Text } from './ui';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'] as const;
export function Keypad({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <View className="flex-row flex-wrap">
      {KEYS.map((k) => (
        <View key={k} className="w-1/3 p-1">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={k === 'del' ? 'Delete' : k === '.' ? 'Decimal point' : k}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
              onChange(applyKey(value, k));
            }}
            onLongPress={k === 'del' ? () => onChange('') : undefined}
            className="h-14 items-center justify-center rounded-input bg-card active:bg-hover"
          >
            {k === 'del' ? (
              <Icon name="arrow-left" size={22} color={colors.ink} />
            ) : (
              <Text weight="medium" tabular className="text-2xl">
                {k}
              </Text>
            )}
          </Pressable>
        </View>
      ))}
    </View>
  );
}
