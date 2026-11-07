'use client';

import type { CreateScheduledEvent, ScheduledEvent } from '@mm/api-client';
import {
  CONFIDENCE_LEVELS,
  EVENT_STATUSES,
  type Confidence,
  type EventDirection,
  type EventKind,
  type EventStatus,
  type MonthEndRule,
  type RecurrenceFrequency,
} from '@mm/types';
import { parseIsoDate } from '@mm/finance-engine';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { AccountSelect, CategorySelect, DateInput, MoneyInput } from '@/components/form-controls';
import { ProjectionNote } from '@/components/states';
import { Button } from '@/components/ui/button';
import { DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Segmented, Switch } from '@/components/ui/misc';
import { useApi } from '@/lib/api';
import {
  CONFIDENCE_LABEL,
  describeRecurrence,
  EVENT_KIND_LABEL,
  EVENT_STATUS_LABEL,
  FREQUENCY_LABEL,
  INFLOW_KINDS,
  moneyToInput,
  ordinal,
  OUTFLOW_KINDS,
  readMoney,
  readOptionalMoney,
} from '@/lib/format';
import { invalidatePlanning, useLookups, useToday } from '@/lib/queries';

export type EventPreset = 'expense' | 'salary' | 'contract' | 'income' | 'purchase';

const FREQUENCIES: RecurrenceFrequency[] = [
  'none',
  'weekly',
  'biweekly',
  'semimonthly',
  'monthly',
  'quarterly',
  'yearly',
];

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

interface FormState {
  direction: EventDirection;
  kind: EventKind;
  name: string;
  amount: string;
  varies: boolean;
  amountMin: string;
  amountMax: string;
  startDate: string;
  accountId: string;
  categoryId: string;
  status: EventStatus;
  confidence: Confidence;
  frequency: RecurrenceFrequency;
  interval: string;
  dayOfMonth: number | null;
  secondDayOfMonth: number | null;
  monthEndRule: MonthEndRule;
  hasEnd: boolean;
  endDate: string;
  count: string;
  useInstallments: boolean;
  installments: string;
  notes: string;
}

function fromEvent(e: ScheduledEvent): FormState {
  return {
    direction: e.direction,
    kind: e.kind,
    name: e.name,
    amount: moneyToInput(e.amount),
    varies: e.amountMin !== null || e.amountMax !== null,
    amountMin: moneyToInput(e.amountMin),
    amountMax: moneyToInput(e.amountMax),
    startDate: e.startDate,
    accountId: e.accountId ?? '',
    categoryId: e.categoryId ?? '',
    status: e.status,
    confidence: e.confidence,
    frequency: e.recurrence.frequency,
    interval: String(e.recurrence.interval ?? 1),
    dayOfMonth: e.recurrence.dayOfMonth,
    secondDayOfMonth: e.recurrence.secondDayOfMonth,
    monthEndRule: e.recurrence.monthEndRule,
    hasEnd: !!e.recurrence.endDate || !!e.recurrence.count,
    endDate: e.recurrence.endDate ?? '',
    count: e.recurrence.count ? String(e.recurrence.count) : '',
    useInstallments: (e.installments ?? 0) > 1,
    installments: e.installments ? String(e.installments) : '',
    notes: e.notes ?? '',
  };
}

function fromPreset(preset: EventPreset, startDate: string): FormState {
  const base: FormState = {
    direction: 'outflow',
    kind: 'bill',
    name: '',
    amount: '',
    varies: false,
    amountMin: '',
    amountMax: '',
    startDate,
    accountId: '',
    categoryId: '',
    status: 'planned',
    confidence: 'confirmed',
    frequency: 'none',
    interval: '1',
    dayOfMonth: null,
    secondDayOfMonth: null,
    monthEndRule: 'clamp',
    hasEnd: false,
    endDate: '',
    count: '',
    useInstallments: false,
    installments: '',
    notes: '',
  };
  switch (preset) {
    case 'salary':
      return {
        ...base,
        direction: 'inflow',
        kind: 'salary',
        name: 'Salary',
        status: 'recurring',
        frequency: 'semimonthly',
        dayOfMonth: 15,
        secondDayOfMonth: 30,
      };
    case 'contract':
      return {
        ...base,
        direction: 'inflow',
        kind: 'contract',
        status: 'recurring',
        frequency: 'monthly',
        hasEnd: true,
      };
    case 'income':
      return { ...base, direction: 'inflow', kind: 'freelance', confidence: 'likely' };
    case 'purchase':
      return { ...base, kind: 'purchase' };
    default:
      return base;
  }
}

/** Create or edit a planned item (bill, purchase, salary, contract…). */
export function EventDialogContent({
  event,
  preset = 'expense',
  defaultDate,
  onDone,
}: {
  event: ScheduledEvent | null;
  preset?: EventPreset;
  defaultDate?: string;
  onDone: () => void;
}) {
  const api = useApi();
  const qc = useQueryClient();
  const today = useToday();
  const { accounts, categories } = useLookups();
  const [f, setF] = useState<FormState>(() =>
    event ? fromEvent(event) : fromPreset(preset, defaultDate ?? today),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));

  const kinds = f.direction === 'inflow' ? INFLOW_KINDS : OUTFLOW_KINDS;
  const startDay = f.startDate ? parseIsoDate(f.startDate).day : 1;
  const isSeries = f.frequency !== 'none' && !f.useInstallments;

  const save = useMutation({
    mutationFn: (body: CreateScheduledEvent) =>
      event ? api.planner.update(event.id, body) : api.planner.create(body),
    onSuccess: (e) => {
      toast.success(event ? 'Planned item updated' : `“${e.name}” added to your calendar`, {
        description: 'Planned — affects projections only.',
      });
      onDone();
    },
    onSettled: () => invalidatePlanning(qc),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!f.name.trim()) next.name = 'Give it a name';
    const amount = readMoney(f.amount);
    if (!amount.ok) next.amount = amount.error;
    const min = f.varies ? readOptionalMoney(f.amountMin) : ({ ok: true, value: null } as const);
    const max = f.varies ? readOptionalMoney(f.amountMax) : ({ ok: true, value: null } as const);
    if (!min.ok) next.amountMin = min.error;
    if (!max.ok) next.amountMax = max.error;
    if (amount.ok && min.ok && min.value !== null && min.value > amount.value)
      next.amountMin = 'Minimum is above the expected amount';
    if (amount.ok && max.ok && max.value !== null && max.value < amount.value)
      next.amountMax = 'Maximum is below the expected amount';
    if (!f.startDate) next.startDate = 'Choose a date';
    const interval = Number(f.interval || '1');
    if (isSeries && (!Number.isInteger(interval) || interval < 1 || interval > 52))
      next.interval = 'Between 1 and 52';
    let count: number | null = null;
    if (isSeries && f.hasEnd && f.count.trim()) {
      count = Number(f.count);
      if (!Number.isInteger(count) || count < 1 || count > 1000) next.count = 'Between 1 and 1000';
    }
    if (isSeries && f.hasEnd && f.endDate && f.endDate < f.startDate)
      next.endDate = 'Ends before it starts';
    if (isSeries && f.hasEnd && !f.endDate && !f.count.trim())
      next.endDate = 'Set an end date or a number of payments';
    let installments: number | null = null;
    if (f.useInstallments) {
      installments = Number(f.installments);
      if (!Number.isInteger(installments) || installments < 2 || installments > 120)
        next.installments = 'Between 2 and 120 payments';
    }
    setErrors(next);
    if (Object.keys(next).length || !amount.ok || !min.ok || !max.ok) return;

    const monthly = ['monthly', 'quarterly', 'yearly'].includes(f.frequency);
    save.mutate({
      name: f.name.trim(),
      direction: f.direction,
      kind: f.kind,
      status: f.status,
      amount: amount.value,
      amountMin: min.value,
      amountMax: max.value,
      currency: 'PHP',
      confidence: f.confidence,
      accountId: f.accountId || null,
      categoryId: f.categoryId || null,
      startDate: f.startDate,
      installments,
      notes: f.notes.trim() || null,
      recurrence: isSeries
        ? {
            frequency: f.frequency,
            interval,
            dayOfMonth:
              f.frequency === 'semimonthly'
                ? (f.dayOfMonth ?? 15)
                : monthly && f.monthEndRule === 'clamp'
                  ? (f.dayOfMonth ?? startDay)
                  : null,
            secondDayOfMonth: f.frequency === 'semimonthly' ? (f.secondDayOfMonth ?? 30) : null,
            monthEndRule: monthly ? f.monthEndRule : 'clamp',
            endDate: f.hasEnd && f.endDate ? f.endDate : null,
            count,
          }
        : {
            frequency: 'none',
            interval: 1,
            dayOfMonth: null,
            secondDayOfMonth: null,
            monthEndRule: 'clamp',
            endDate: null,
            count: null,
          },
    });
  }

  const preview = f.startDate
    ? f.useInstallments
      ? `${f.installments || '?'} monthly payments from ${describeRecurrence({ frequency: 'none' }, f.startDate).replace('Once · ', '')}`
      : describeRecurrence(
          {
            frequency: f.frequency,
            interval: Number(f.interval) || 1,
            dayOfMonth: f.dayOfMonth,
            secondDayOfMonth: f.secondDayOfMonth,
            monthEndRule: f.monthEndRule,
            endDate: f.hasEnd ? f.endDate || null : null,
            count: f.hasEnd && f.count ? Number(f.count) : null,
          },
          f.startDate,
        )
    : '';

  return (
    <DialogContent
      size="lg"
      title={
        event
          ? 'Edit planned item'
          : f.direction === 'inflow'
            ? 'Add expected income'
            : 'Plan an expense'
      }
      description="Planned — affects projections only. Mark it paid when the money actually moves."
    >
      <form onSubmit={submit} noValidate>
        <DialogBody>
          {event ? null : (
            <div className="flex flex-wrap gap-2">
              <span className="self-center text-[12px] text-muted">Quick start:</span>
              <Button
                size="sm"
                variant="subtle"
                onClick={() => setF(fromPreset('salary', f.startDate || today))}
              >
                Salary — 15th &amp; 30th
              </Button>
              <Button
                size="sm"
                variant="subtle"
                onClick={() => setF(fromPreset('contract', f.startDate || today))}
              >
                Contract with end date
              </Button>
              <Button
                size="sm"
                variant="subtle"
                onClick={() => setF(fromPreset('purchase', f.startDate || today))}
              >
                Planned purchase
              </Button>
            </div>
          )}

          <Segmented
            label="Money direction"
            value={f.direction}
            onChange={(d) =>
              setF((s) => ({
                ...s,
                direction: d,
                kind: d === 'inflow' ? 'salary' : 'bill',
                categoryId: '',
              }))
            }
            options={[
              { value: 'outflow', label: 'Money out' },
              { value: 'inflow', label: 'Money in' },
            ]}
            className="self-start"
          />

          <div className="grid gap-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <Field label="Name" htmlFor="ev-name" error={errors.name}>
              <Input
                id="ev-name"
                autoFocus
                maxLength={120}
                value={f.name}
                placeholder={
                  f.direction === 'inflow' ? 'e.g. Salary — Acme Corp' : 'e.g. Meralco bill'
                }
                onChange={(e) => set('name', e.target.value)}
              />
            </Field>
            <Field label="Kind" htmlFor="ev-kind">
              <NativeSelect
                id="ev-kind"
                value={f.kind}
                onChange={(e) => set('kind', e.target.value as EventKind)}
              >
                {kinds.map((k) => (
                  <option key={k} value={k}>
                    {EVENT_KIND_LABEL[k]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={f.useInstallments ? 'Total amount' : 'Expected amount'}
              htmlFor="ev-amount"
              error={errors.amount}
            >
              <MoneyInput
                id="ev-amount"
                value={f.amount}
                onChange={(e) => set('amount', e.target.value)}
              />
            </Field>
            <Field
              label={
                f.useInstallments ? 'First payment' : isSeries ? 'First date' : 'Expected date'
              }
              htmlFor="ev-date"
              error={errors.startDate}
            >
              <DateInput
                id="ev-date"
                value={f.startDate}
                onChange={(e) => set('startDate', e.target.value)}
              />
            </Field>
          </div>

          <label className="flex items-center gap-2 text-[13px]">
            <Switch checked={f.varies} onCheckedChange={(v) => set('varies', v)} />
            The amount varies (e.g. utility bills)
          </label>
          {f.varies ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Minimum"
                htmlFor="ev-min"
                optional
                error={errors.amountMin}
                hint={
                  f.direction === 'inflow'
                    ? 'Used by the conservative view'
                    : 'Used by the optimistic view'
                }
              >
                <MoneyInput
                  id="ev-min"
                  value={f.amountMin}
                  onChange={(e) => set('amountMin', e.target.value)}
                />
              </Field>
              <Field
                label="Maximum"
                htmlFor="ev-max"
                optional
                error={errors.amountMax}
                hint={
                  f.direction === 'inflow'
                    ? 'Used by the optimistic view'
                    : 'Used by the conservative view'
                }
              >
                <MoneyInput
                  id="ev-max"
                  value={f.amountMax}
                  onChange={(e) => set('amountMax', e.target.value)}
                />
              </Field>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={f.direction === 'inflow' ? 'Receive into' : 'Pay from'}
              htmlFor="ev-account"
              optional
            >
              <AccountSelect
                id="ev-account"
                accounts={accounts}
                value={f.accountId}
                onChange={(v) => set('accountId', v)}
                placeholder="Decide later"
              />
            </Field>
            <Field label="Category" htmlFor="ev-category" optional>
              <CategorySelect
                id="ev-category"
                categories={categories}
                kind={f.direction === 'inflow' ? 'income' : 'expense'}
                value={f.categoryId}
                onChange={(v) => set('categoryId', v)}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Status" htmlFor="ev-status">
              <NativeSelect
                id="ev-status"
                value={f.status}
                onChange={(e) => set('status', e.target.value as EventStatus)}
              >
                {EVENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {EVENT_STATUS_LABEL[s]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field
              label="Confidence"
              htmlFor="ev-confidence"
              hint={
                f.direction === 'inflow' && f.confidence !== 'confirmed'
                  ? 'Not counted in Safe to spend; excluded from the conservative view.'
                  : undefined
              }
            >
              <NativeSelect
                id="ev-confidence"
                value={f.confidence}
                onChange={(e) => set('confidence', e.target.value as Confidence)}
              >
                {CONFIDENCE_LEVELS.map((c) => (
                  <option key={c} value={c}>
                    {CONFIDENCE_LABEL[c]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>

          {f.direction === 'outflow' ? (
            <label className="flex items-center gap-2 text-[13px]">
              <Switch
                checked={f.useInstallments}
                onCheckedChange={(v) => setF((s) => ({ ...s, useInstallments: v }))}
              />
              Pay in monthly installments
            </label>
          ) : null}

          {f.useInstallments ? (
            <Field
              label="Number of installments"
              htmlFor="ev-inst"
              error={errors.installments}
              hint="The total is split exactly across monthly payments."
            >
              <Input
                id="ev-inst"
                inputMode="numeric"
                className="tabular max-w-40"
                value={f.installments}
                onChange={(e) => set('installments', e.target.value.replace(/\D/g, ''))}
              />
            </Field>
          ) : (
            <fieldset className="flex flex-col gap-4 rounded-[12px] border p-4">
              <legend className="section-label px-1">Repeats</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Frequency" htmlFor="ev-freq">
                  <NativeSelect
                    id="ev-freq"
                    value={f.frequency}
                    onChange={(e) => {
                      const freq = e.target.value as RecurrenceFrequency;
                      setF((s) => ({
                        ...s,
                        frequency: freq,
                        dayOfMonth: freq === 'semimonthly' ? (s.dayOfMonth ?? 15) : s.dayOfMonth,
                        secondDayOfMonth:
                          freq === 'semimonthly' ? (s.secondDayOfMonth ?? 30) : s.secondDayOfMonth,
                      }));
                    }}
                  >
                    {FREQUENCIES.map((fr) => (
                      <option key={fr} value={fr}>
                        {FREQUENCY_LABEL[fr]}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                {isSeries ? (
                  <Field
                    label="Every"
                    htmlFor="ev-interval"
                    error={errors.interval}
                    hint="e.g. 2 = every other period"
                  >
                    <Input
                      id="ev-interval"
                      inputMode="numeric"
                      className="tabular"
                      value={f.interval}
                      onChange={(e) => set('interval', e.target.value.replace(/\D/g, ''))}
                    />
                  </Field>
                ) : null}
              </div>

              {f.frequency === 'semimonthly' ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="First payday" htmlFor="ev-d1">
                    <DaySelect
                      id="ev-d1"
                      value={f.dayOfMonth ?? 15}
                      onChange={(v) => set('dayOfMonth', v)}
                    />
                  </Field>
                  <Field
                    label="Second payday"
                    htmlFor="ev-d2"
                    hint="Days past a month's end fall on its last day (e.g. 30 → Feb 28)."
                  >
                    <DaySelect
                      id="ev-d2"
                      value={f.secondDayOfMonth ?? 30}
                      onChange={(v) => set('secondDayOfMonth', v)}
                    />
                  </Field>
                </div>
              ) : null}

              {['monthly', 'quarterly', 'yearly'].includes(f.frequency) ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="On" htmlFor="ev-rule">
                    <NativeSelect
                      id="ev-rule"
                      value={f.monthEndRule}
                      onChange={(e) => set('monthEndRule', e.target.value as MonthEndRule)}
                    >
                      <option value="clamp">A specific day of the month</option>
                      <option value="last_day">The last day of the month</option>
                    </NativeSelect>
                  </Field>
                  {f.monthEndRule === 'clamp' ? (
                    <Field
                      label="Day of month"
                      htmlFor="ev-dom"
                      hint="Short months use their last day (31st → Apr 30)."
                    >
                      <DaySelect
                        id="ev-dom"
                        value={f.dayOfMonth ?? startDay}
                        onChange={(v) => set('dayOfMonth', v)}
                      />
                    </Field>
                  ) : null}
                </div>
              ) : null}

              {isSeries ? (
                <>
                  <label className="flex items-center gap-2 text-[13px]">
                    <Switch checked={f.hasEnd} onCheckedChange={(v) => set('hasEnd', v)} />
                    Ends (e.g. a contract end date)
                  </label>
                  {f.hasEnd ? (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="End date" htmlFor="ev-end" error={errors.endDate} optional>
                        <DateInput
                          id="ev-end"
                          value={f.endDate}
                          min={f.startDate}
                          onChange={(e) => set('endDate', e.target.value)}
                        />
                      </Field>
                      <Field
                        label="Or after this many payments"
                        htmlFor="ev-count"
                        error={errors.count}
                        optional
                      >
                        <Input
                          id="ev-count"
                          inputMode="numeric"
                          className="tabular"
                          value={f.count}
                          onChange={(e) => set('count', e.target.value.replace(/\D/g, ''))}
                        />
                      </Field>
                    </div>
                  ) : null}
                </>
              ) : null}
            </fieldset>
          )}

          {preview ? (
            <p className="rounded-[10px] bg-hover px-3 py-2 text-[13px]">
              <span className="text-muted">Schedule: </span>
              <span className="font-medium">{preview}</span>
            </p>
          ) : null}

          <Field label="Notes" htmlFor="ev-notes" optional>
            <Textarea
              id="ev-notes"
              rows={2}
              maxLength={2000}
              value={f.notes}
              onChange={(e) => set('notes', e.target.value)}
            />
          </Field>
          <ProjectionNote />
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : event ? 'Save changes' : 'Add to calendar'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function DaySelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: number;
  onChange: (day: number) => void;
}) {
  return (
    <NativeSelect id={id} value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {DAYS.map((d) => (
        <option key={d} value={d}>
          {d === 31 ? '31st (month end)' : ordinal(d)}
        </option>
      ))}
    </NativeSelect>
  );
}
