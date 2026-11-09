'use client';

import type { Account, Category } from '@mm/api-client';
import type { CategoryKind } from '@mm/types';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';
import { ACCOUNT_TYPE_LABEL } from '@/lib/format';
import { inputClass, NativeSelect } from './ui/input';

/**
 * Money text input. Keeps the raw string (parsed with `parseMoney` on submit — never floats),
 * shows a ₱ prefix, and opens the decimal keypad on mobile.
 */
export function MoneyInput({
  className,
  allowNegative,
  ...props
}: Omit<ComponentProps<'input'>, 'type'> & { allowNegative?: boolean }) {
  return (
    <div className={cn('relative min-w-0', className)}>
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[15px] text-muted"
      >
        ₱
      </span>
      <input
        type="text"
        // The decimal keypad has no minus key on iOS (and many Android keyboards), so fields that
        // accept negatives get the full keyboard.
        inputMode={allowNegative ? 'text' : 'decimal'}
        autoComplete="off"
        placeholder={allowNegative ? '0.00 or -0.00' : '0.00'}
        className={cn(inputClass, 'tabular pl-7')}
        {...props}
      />
    </div>
  );
}

export function DateInput({ className, ...props }: Omit<ComponentProps<'input'>, 'type'>) {
  return <input type="date" className={cn(inputClass, 'tabular', className)} {...props} />;
}

export function AccountSelect({
  accounts,
  value,
  onChange,
  includeArchived,
  placeholder,
  ...props
}: Omit<ComponentProps<'select'>, 'onChange' | 'value'> & {
  accounts: readonly Account[];
  value: string;
  onChange: (id: string) => void;
  includeArchived?: boolean;
  placeholder?: string;
}) {
  const list = accounts.filter((a) => includeArchived || !a.archived || a.id === value);
  return (
    <NativeSelect value={value} onChange={(e) => onChange(e.target.value)} {...props}>
      {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
      {list.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name} · {ACCOUNT_TYPE_LABEL[a.type]}
          {a.archived ? ' (archived)' : ''}
        </option>
      ))}
    </NativeSelect>
  );
}

export function CategorySelect({
  categories,
  kind,
  value,
  onChange,
  placeholder = 'Uncategorised',
  ...props
}: Omit<ComponentProps<'select'>, 'onChange' | 'value'> & {
  categories: readonly Category[];
  kind?: CategoryKind;
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}) {
  const list = categories.filter(
    (c) => (!kind || c.kind === kind) && (!c.archived || c.id === value),
  );
  return (
    <NativeSelect value={value} onChange={(e) => onChange(e.target.value)} {...props}>
      <option value="">{placeholder}</option>
      {list.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
          {!kind ? ` (${c.kind})` : ''}
        </option>
      ))}
    </NativeSelect>
  );
}
