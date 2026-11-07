import type { Account, Category } from '@mm/api-client';
import {
  addDays,
  addMonthsClamped,
  dayOfWeek,
  daysInMonth,
  formatDate,
  formatMonth,
  makeDate,
  parseIsoDate,
} from '@mm/finance-engine';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { relativeDay, today } from '@/lib/format';
import { colors } from '@/lib/theme';
import { Icon } from './Icon';
import { Chip, IconButton, Label, Sheet, Text } from './ui';

export function AccountChips({
  accounts,
  value,
  onChange,
  exclude,
}: {
  accounts: Account[];
  value: string | null;
  onChange: (id: string) => void;
  exclude?: string | null;
}) {
  const list = accounts.filter((a) => !a.archived && a.id !== exclude);
  if (!list.length) {
    return (
      <Text className="text-sm text-muted">No accounts yet — sync or add one in Accounts.</Text>
    );
  }
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
      {list.map((a) => (
        <Chip key={a.id} label={a.name} selected={a.id === value} onPress={() => onChange(a.id)} />
      ))}
    </ScrollView>
  );
}

export function CategoryChips({
  categories,
  kind,
  value,
  onChange,
}: {
  categories: Category[];
  kind: 'income' | 'expense';
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const list = categories.filter((c) => c.kind === kind && !c.archived);
  return (
    <View className="flex-row flex-wrap gap-2">
      <Chip label="None" selected={value === null} onPress={() => onChange(null)} />
      {list.map((c) => (
        <Chip
          key={c.id}
          label={c.name}
          selected={c.id === value}
          onPress={() => onChange(c.id === value ? null : c.id)}
        />
      ))}
    </View>
  );
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** Month grid. `marks` adds a dot under dates (e.g. planned items). */
export function MonthCalendar({
  month,
  onMonthChange,
  selected,
  onSelect,
  marks,
  minDate,
}: {
  /** Any date inside the month to show. */
  month: string;
  onMonthChange: (month: string) => void;
  selected?: string | null;
  onSelect?: (date: string) => void;
  marks?: Map<string, 'inflow' | 'outflow' | 'both'>;
  minDate?: string;
}) {
  const { year, month: m } = parseIsoDate(month);
  const first = makeDate(year, m, 1);
  const lead = dayOfWeek(first);
  const days = daysInMonth(year, m);
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: days }, (_, i) => makeDate(year, m, i + 1)),
  ];
  while (cells.length % 7) cells.push(null);
  const t = today();
  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <IconButton
          icon="chevron-left"
          label="Previous month"
          onPress={() => onMonthChange(addMonthsClamped(first, -1, 1))}
        />
        <Text weight="semibold">{formatMonth(first.slice(0, 7))}</Text>
        <IconButton
          icon="chevron-right"
          label="Next month"
          onPress={() => onMonthChange(addMonthsClamped(first, 1, 1))}
        />
      </View>
      <View className="flex-row">
        {WEEKDAYS.map((d, i) => (
          <Text key={i} className="flex-1 text-center text-xs text-muted">
            {d}
          </Text>
        ))}
      </View>
      <View className="flex-row flex-wrap">
        {cells.map((date, i) => {
          if (!date)
            return <View key={`e${i}`} style={{ width: `${100 / 7}%` }} className="h-11" />;
          const isSel = date === selected;
          const isToday = date === t;
          const disabled = !!minDate && date < minDate;
          const mark = marks?.get(date);
          return (
            <Pressable
              key={date}
              accessibilityRole="button"
              accessibilityLabel={formatDate(date)}
              accessibilityState={{ selected: isSel, disabled }}
              disabled={disabled || !onSelect}
              onPress={() => onSelect?.(date)}
              style={{ width: `${100 / 7}%` }}
              className="h-11 items-center justify-center"
            >
              <View
                className={`h-9 w-9 items-center justify-center rounded-full ${isSel ? 'bg-ink' : isToday ? 'border border-ink' : ''}`}
              >
                <Text
                  tabular
                  weight={isSel || isToday ? 'semibold' : 'regular'}
                  className={`text-sm ${isSel ? 'text-card' : disabled ? 'text-subtle' : 'text-ink'}`}
                >
                  {Number(date.slice(8))}
                </Text>
              </View>
              {mark ? (
                <View
                  className="absolute bottom-0.5 h-1.5 w-1.5 rounded-full"
                  style={{
                    backgroundColor:
                      mark === 'inflow'
                        ? colors.positive
                        : mark === 'outflow'
                          ? colors.ink
                          : colors.warning,
                  }}
                />
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Date field: quick chips (Today / Yesterday) plus a calendar sheet. */
export function DateField({
  label = 'Date',
  value,
  onChange,
  minDate,
  quick = 'past',
}: {
  label?: string;
  value: string;
  onChange: (d: string) => void;
  minDate?: string;
  quick?: 'past' | 'future' | 'none';
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(value);
  const t = today();
  const quickDates =
    quick === 'past'
      ? [t, addDays(t, -1)]
      : quick === 'future'
        ? [t, addDays(t, 1), addDays(t, 7)]
        : [];
  return (
    <View className="gap-1.5">
      <Label>{label}</Label>
      <View className="flex-row flex-wrap gap-2">
        {quickDates.map((d) => (
          <Chip key={d} label={relativeDay(d)} selected={value === d} onPress={() => onChange(d)} />
        ))}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Pick a date, currently ${formatDate(value)}`}
          onPress={() => {
            setMonth(value);
            setOpen(true);
          }}
          className={`min-h-11 flex-row items-center gap-2 rounded-full border px-4 ${quickDates.includes(value) ? 'border-border bg-card' : 'border-ink bg-ink'}`}
        >
          <Icon
            name="calendar"
            size={16}
            color={quickDates.includes(value) ? colors.ink : colors.card}
          />
          <Text
            weight="medium"
            className={`text-sm ${quickDates.includes(value) ? 'text-ink' : 'text-card'}`}
          >
            {quickDates.includes(value) ? 'Pick date' : formatDate(value)}
          </Text>
        </Pressable>
      </View>
      <Sheet visible={open} onClose={() => setOpen(false)} title={label}>
        <MonthCalendar
          month={month}
          onMonthChange={setMonth}
          selected={value}
          minDate={minDate}
          onSelect={(d) => {
            onChange(d);
            setOpen(false);
          }}
        />
      </Sheet>
    </View>
  );
}
