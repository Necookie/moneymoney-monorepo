import * as Haptics from 'expo-haptics';
import { type ReactNode } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text as RNText,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextProps as RNTextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatMoney } from '@/lib/format';
import { colors, fonts } from '@/lib/theme';
import { Icon, type IconName } from './Icon';

// ── Typography ───────────────────────────────────────────────────────────────────────────────

type Weight = keyof typeof fonts;

export interface TextProps extends Omit<RNTextProps, 'style' | 'children'> {
  children?: ReactNode;
  className?: string;
  weight?: Weight;
  /** Tabular figures (always on for money). */
  tabular?: boolean;
  style?: StyleProp<TextStyle>;
}

/**
 * NativeWind resolves conflicting utilities by stylesheet order, not by their order in
 * `className`, so defaults must only be added when the caller did not choose a value.
 */
const TEXT_COLOR_RE =
  /(^|\s)text-(ink|ink-soft|muted|subtle|card|canvas|accent|accent-ink|positive|negative|warning|info|projection)(\s|$)/;
const TEXT_SIZE_RE = /(^|\s)text-(xs|sm|base|lg|xl|2xl|3xl|display)(\s|$)/;
export const hasTextColor = (cls = '') => TEXT_COLOR_RE.test(cls);
const hasTextSize = (cls = '') => TEXT_SIZE_RE.test(cls);

export function Text({
  children,
  className,
  weight = 'regular',
  tabular,
  style,
  ...rest
}: TextProps) {
  return (
    <RNText
      className={`${hasTextColor(className) ? '' : 'text-ink'} ${hasTextSize(className) ? '' : 'text-base'} ${className ?? ''}`}
      style={[
        { fontFamily: fonts[weight] },
        tabular ? { fontVariant: ['tabular-nums'] } : null,
        style,
      ]}
      {...rest}
    >
      {children}
    </RNText>
  );
}

/** Small uppercase, letter-spaced section label. */
export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Text
      weight="medium"
      className={`text-xs uppercase ${hasTextColor(className) ? '' : 'text-muted'} ${className ?? ''}`}
      style={{ letterSpacing: 0.8 }}
    >
      {children}
    </Text>
  );
}

export interface MoneyProps {
  value: number;
  className?: string;
  weight?: Weight;
  signed?: boolean;
  /** Colour by sign using financial meaning colours. */
  tone?: 'auto' | 'ink' | 'muted' | 'positive' | 'negative';
  compactZeroCents?: boolean;
}

export function Money({
  value,
  className,
  weight = 'semibold',
  signed,
  tone = 'ink',
  compactZeroCents,
}: MoneyProps) {
  const toneClass = hasTextColor(className)
    ? ''
    : tone === 'auto'
      ? value < 0
        ? 'text-negative'
        : value > 0 && signed
          ? 'text-positive'
          : 'text-ink'
      : {
          ink: 'text-ink',
          muted: 'text-muted',
          positive: 'text-positive',
          negative: 'text-negative',
        }[tone];
  return (
    <Text weight={weight} tabular className={`${toneClass} ${className ?? ''}`} numberOfLines={1}>
      {formatMoney(value, { signed, compactZeroCents })}
    </Text>
  );
}

// ── Layout ───────────────────────────────────────────────────────────────────────────────────

export function Card({
  children,
  className,
  style,
  dark,
}: {
  children: ReactNode;
  className?: string;
  style?: StyleProp<ViewStyle>;
  dark?: boolean;
}) {
  return (
    <View
      className={`rounded-card border p-4 ${dark ? 'border-surface-dark bg-surface-dark' : 'border-border bg-card'} ${className ?? ''}`}
      style={style}
    >
      {children}
    </View>
  );
}

export function Divider({ className }: { className?: string }) {
  return <View className={`h-px bg-border ${className ?? ''}`} />;
}

export function Row({ children, className }: { children: ReactNode; className?: string }) {
  return <View className={`flex-row items-center ${className ?? ''}`}>{children}</View>;
}

// ── Controls ─────────────────────────────────────────────────────────────────────────────────

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'dark' | 'secondary' | 'ghost' | 'danger';
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  size?: 'md' | 'lg';
}

export function Button({
  label,
  onPress,
  variant = 'dark',
  icon,
  disabled,
  loading,
  className,
  size = 'md',
}: ButtonProps) {
  const styles = {
    primary: { box: 'bg-accent', text: 'text-accent-ink', icon: colors.accentInk },
    dark: { box: 'bg-ink', text: 'text-card', icon: colors.card },
    secondary: { box: 'bg-card border border-border-strong', text: 'text-ink', icon: colors.ink },
    ghost: { box: 'bg-transparent', text: 'text-ink', icon: colors.ink },
    danger: { box: 'bg-card border border-negative', text: 'text-negative', icon: colors.negative },
  }[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={() => {
        Haptics.selectionAsync().catch(() => undefined);
        onPress?.();
      }}
      className={`flex-row items-center justify-center gap-2 rounded-button px-4 ${size === 'lg' ? 'h-14' : 'h-12'} ${styles.box} ${inactive ? 'opacity-50' : 'active:opacity-80'} ${className ?? ''}`}
    >
      {loading ? (
        <ActivityIndicator color={styles.icon} />
      ) : icon ? (
        <Icon name={icon} size={18} color={styles.icon} />
      ) : null}
      <Text
        weight="semibold"
        className={`${styles.text} ${size === 'lg' ? 'text-lg' : 'text-base'}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function IconButton({
  icon,
  label,
  onPress,
  className,
  color,
}: {
  icon: IconName;
  label: string;
  onPress?: () => void;
  className?: string;
  color?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      onPress={onPress}
      className={`h-11 w-11 items-center justify-center rounded-full active:bg-hover ${className ?? ''}`}
    >
      <Icon name={icon} color={color} />
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  count,
  tone,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  count?: number;
  tone?: 'positive' | 'warning' | 'negative' | 'muted';
}) {
  const toneBox =
    tone === 'positive'
      ? 'bg-positive-soft border-positive-soft'
      : tone === 'warning'
        ? 'bg-warning-soft border-warning-soft'
        : tone === 'negative'
          ? 'bg-negative-soft border-negative-soft'
          : null;
  const toneText =
    tone === 'positive'
      ? 'text-positive'
      : tone === 'warning'
        ? 'text-warning'
        : tone === 'negative'
          ? 'text-negative'
          : 'text-muted';
  const box = selected ? 'bg-ink border-ink' : (toneBox ?? 'bg-card border-border');
  const text = selected ? 'text-card' : tone ? toneText : 'text-ink';
  const content = (
    <>
      <Text weight="medium" className={`text-sm ${text}`}>
        {label}
      </Text>
      {count !== undefined ? (
        <Text tabular className={`text-sm ${selected ? 'text-accent' : 'text-muted'}`}>
          {count}
        </Text>
      ) : null}
    </>
  );
  if (!onPress) {
    return (
      <View className={`flex-row items-center gap-1.5 rounded-full border px-2.5 py-1 ${box}`}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      className={`min-h-11 flex-row items-center gap-1.5 rounded-full border px-4 ${box} active:opacity-80`}
    >
      {content}
    </Pressable>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View className="flex-row rounded-input border border-border bg-card p-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => {
              Haptics.selectionAsync().catch(() => undefined);
              onChange(o.value);
            }}
            className={`h-11 flex-1 items-center justify-center rounded-button ${active ? 'bg-ink' : ''}`}
          >
            <Text weight="medium" className={`text-sm ${active ? 'text-card' : 'text-ink'}`}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Field({
  label,
  hint,
  error,
  className,
  ...input
}: TextInputProps & { label?: string; hint?: string; error?: string | null; className?: string }) {
  return (
    <View className={`gap-1.5 ${className ?? ''}`}>
      {label ? <Label>{label}</Label> : null}
      <TextInput
        placeholderTextColor={colors.subtle}
        className={`min-h-12 rounded-input border bg-card px-3 text-base text-ink ${error ? 'border-negative' : 'border-border-strong'}`}
        style={{ fontFamily: fonts.regular }}
        {...input}
      />
      {error ? <Text className="text-sm text-negative">{error}</Text> : null}
      {!error && hint ? <Text className="text-sm text-muted">{hint}</Text> : null}
    </View>
  );
}

export function Toggle({
  value,
  onChange,
  disabled,
  label,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      disabled={disabled}
      onPress={() => onChange(!value)}
      hitSlop={8}
      className={`h-8 w-14 justify-center rounded-full px-1 ${value ? 'bg-ink' : 'bg-border-strong'} ${disabled ? 'opacity-40' : ''}`}
    >
      <View
        className={`h-6 w-6 rounded-full ${value ? 'bg-accent' : 'bg-card'}`}
        style={{ alignSelf: value ? 'flex-end' : 'flex-start' }}
      />
    </Pressable>
  );
}

// ── Feedback ─────────────────────────────────────────────────────────────────────────────────

export function Banner({
  tone = 'info',
  icon,
  title,
  body,
  action,
}: {
  tone?: 'info' | 'warning' | 'negative' | 'positive' | 'neutral';
  icon?: IconName;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  const box = {
    info: 'bg-info-soft',
    warning: 'bg-warning-soft',
    negative: 'bg-negative-soft',
    positive: 'bg-positive-soft',
    neutral: 'bg-hover',
  }[tone];
  const color = {
    info: colors.info,
    warning: colors.warning,
    negative: colors.negative,
    positive: colors.positive,
    neutral: colors.ink,
  }[tone];
  return (
    <View className={`flex-row gap-3 rounded-card p-3 ${box}`}>
      {icon ? <Icon name={icon} size={20} color={color} /> : null}
      <View className="flex-1 gap-0.5">
        <Text weight="semibold" className="text-sm" style={{ color }}>
          {title}
        </Text>
        {body ? <Text className="text-sm text-ink-soft">{body}</Text> : null}
        {action ? <View className="mt-2 flex-row gap-2">{action}</View> : null}
      </View>
    </View>
  );
}

export function EmptyState({
  icon = 'sparkles',
  title,
  body,
  action,
}: {
  icon?: IconName;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <View className="items-center gap-2 px-6 py-10">
      <Icon name={icon} size={28} color={colors.muted} />
      <Text weight="semibold" className="text-center text-lg">
        {title}
      </Text>
      {body ? <Text className="text-center text-sm text-muted">{body}</Text> : null}
      {action ? <View className="mt-2">{action}</View> : null}
    </View>
  );
}

export function Skeleton({ className }: { className?: string }) {
  const cls = className ?? 'h-4 w-full';
  return <View className={`rounded-button ${/(^|\s)bg-/.test(cls) ? '' : 'bg-hover'} ${cls}`} />;
}

export function ErrorCard({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Banner
      tone="negative"
      icon="circle-alert"
      title="Couldn't load this"
      body={message}
      action={onRetry ? <Button label="Try again" variant="secondary" onPress={onRetry} /> : null}
    />
  );
}

export function ProgressBar({
  value,
  tone = 'ink',
}: {
  /** 0..1 (clamped) */
  value: number;
  tone?: 'ink' | 'positive' | 'warning' | 'negative';
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const bg = {
    ink: 'bg-ink',
    positive: 'bg-positive',
    warning: 'bg-warning',
    negative: 'bg-negative',
  }[tone];
  return (
    <View className="h-2 overflow-hidden rounded-full bg-hover">
      <View className={`h-2 rounded-full ${bg}`} style={{ width: `${pct}%` }} />
    </View>
  );
}

// ── Bottom sheet (Modal) ─────────────────────────────────────────────────────────────────────

export function Sheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable accessibilityLabel="Close" className="flex-1 bg-black/30" onPress={onClose} />
      <View
        className="rounded-t-card-lg bg-canvas px-4 pt-3"
        style={{ paddingBottom: Math.max(insets.bottom, 16), maxHeight: '88%' }}
      >
        <View className="mb-2 items-center">
          <View className="h-1 w-10 rounded-full bg-border-strong" />
        </View>
        <Row className="mb-3 justify-between">
          <Text weight="semibold" className="text-lg">
            {title}
          </Text>
          <IconButton icon="x" label="Close" onPress={onClose} />
        </Row>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-3 pb-2">
          {children}
        </ScrollView>
      </View>
    </Modal>
  );
}

export function ListRow({
  title,
  subtitle,
  right,
  icon,
  onPress,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  icon?: IconName;
  onPress?: () => void;
}) {
  const body = (
    <View className="min-h-14 flex-row items-center gap-3 py-2">
      {icon ? (
        <View className="h-10 w-10 items-center justify-center rounded-full bg-canvas">
          <Icon name={icon} size={20} />
        </View>
      ) : null}
      <View className="flex-1">
        <Text weight="medium" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text className="text-sm text-muted" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
      {onPress && !right ? <Icon name="chevron-right" size={18} color={colors.subtle} /> : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} className="active:opacity-70">
      {body}
    </Pressable>
  );
}
