'use client';

import type { ScenarioDto, ScenarioResponse } from '@mm/api-client';
import type { ForecastMode } from '@mm/types';
import { addDays, formatDate, formatMoney } from '@mm/finance-engine';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { AccountSelect, DateInput, MoneyInput } from '@/components/form-controls';
import { Icon } from '@/components/icons/icon';
import { Money } from '@/components/money';
import { ErrorState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input, NativeSelect } from '@/components/ui/input';
import { Badge } from '@/components/ui/misc';
import { useApi } from '@/lib/api';
import { readMoney } from '@/lib/format';
import { useLookups, usePlannerEvents, useToday } from '@/lib/queries';
import { cn, newId } from '@/lib/utils';

type ScenarioType = Exclude<ScenarioDto['type'], 'baseline'>;

interface Draft {
  key: string;
  type: ScenarioType;
  days: string;
  fromDate: string;
  amount: string;
  date: string;
  name: string;
  accountId: string;
  installments: string;
  eventId: string;
  newDate: string;
  percent: string;
  incomeEventId: string;
}

const TYPE_LABEL: Record<ScenarioType, string> = {
  salary_delayed: 'Salary delayed',
  income_lost: 'Income lost',
  purchase_added: 'Purchase added',
  purchase_postponed: 'Purchase postponed',
  spending_reduced: 'Spending reduced',
};

function emptyDraft(type: ScenarioType, today: string): Draft {
  return {
    key: newId(),
    type,
    days: '7',
    fromDate: addDays(today, 30),
    amount: '',
    date: today,
    name: '',
    accountId: '',
    installments: '',
    eventId: '',
    newDate: addDays(today, 30),
    percent: '20',
    incomeEventId: '',
  };
}

type Built = { ok: true; scenario: ScenarioDto } | { ok: false; error: string };

function build(d: Draft): Built {
  switch (d.type) {
    case 'salary_delayed': {
      const days = Number(d.days);
      if (!Number.isInteger(days) || days < 1 || days > 180)
        return { ok: false, error: 'Delay must be 1–180 days' };
      return {
        ok: true,
        scenario: {
          type: 'salary_delayed',
          days,
          eventIds: d.incomeEventId ? [d.incomeEventId] : undefined,
          label: `Salary ${days} days late`,
        },
      };
    }
    case 'income_lost':
      if (!d.fromDate) return { ok: false, error: 'Choose when the income stops' };
      return {
        ok: true,
        scenario: {
          type: 'income_lost',
          fromDate: d.fromDate,
          eventIds: d.incomeEventId ? [d.incomeEventId] : undefined,
          label: `Income lost from ${formatDate(d.fromDate, false)}`,
        },
      };
    case 'purchase_added': {
      const amount = readMoney(d.amount);
      if (!amount.ok) return { ok: false, error: amount.error };
      const inst = d.installments ? Number(d.installments) : null;
      if (inst !== null && (!Number.isInteger(inst) || inst < 2 || inst > 120))
        return { ok: false, error: 'Installments must be 2–120' };
      return {
        ok: true,
        scenario: {
          type: 'purchase_added',
          amount: amount.value,
          date: d.date,
          name: d.name.trim() || undefined,
          accountId: d.accountId || null,
          installments: inst,
          label: `${d.name.trim() || 'Purchase'} ${formatMoney(amount.value, { compactZeroCents: true })}`,
        },
      };
    }
    case 'purchase_postponed':
      if (!d.eventId) return { ok: false, error: 'Pick a planned item' };
      if (!d.newDate) return { ok: false, error: 'Choose the new date' };
      return {
        ok: true,
        scenario: {
          type: 'purchase_postponed',
          eventId: d.eventId,
          newDate: d.newDate,
          label: `Postponed to ${formatDate(d.newDate, false)}`,
        },
      };
    case 'spending_reduced': {
      const percent = Number(d.percent);
      if (!Number.isInteger(percent) || percent < 1 || percent > 100)
        return { ok: false, error: 'Percent must be 1–100' };
      return {
        ok: true,
        scenario: { type: 'spending_reduced', percent, label: `Spending −${percent}%` },
      };
    }
  }
}

/** What-if comparison against the baseline (`POST /forecast/scenarios`). Never saves anything. */
export function ScenarioCard({ horizonDays, mode }: { horizonDays: number; mode: ForecastMode }) {
  const api = useApi();
  const today = useToday();
  const events = usePlannerEvents();
  const [drafts, setDrafts] = useState<Draft[]>(() => [emptyDraft('salary_delayed', today)]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ data: ScenarioResponse; horizon: number } | null>(null);

  const run = useMutation({
    mutationFn: (scenarios: ScenarioDto[]) =>
      api.forecast.scenarios({ horizonDays, mode, scenarios }),
    meta: { silent: true },
    onSuccess: (data) => setResult({ data, horizon: horizonDays }),
  });

  const activeEvents = (events.data ?? []).filter(
    (e) => e.status !== 'cancelled' && e.status !== 'paid',
  );
  const incomeEvents = activeEvents.filter((e) => e.direction === 'inflow');
  const outflowEvents = activeEvents.filter((e) => e.direction === 'outflow');

  const update = (key: string, patch: Partial<Draft>) =>
    setDrafts((list) => list.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  function compare() {
    const nextErrors: Record<string, string> = {};
    const scenarios: ScenarioDto[] = [{ type: 'baseline', label: 'Baseline' }];
    for (const d of drafts) {
      const b = build(d);
      if (b.ok) scenarios.push(b.scenario);
      else nextErrors[d.key] = b.error;
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length === 0) run.mutate(scenarios);
  }

  return (
    <Card>
      <CardHeader
        title="Scenario comparison"
        description={`What if…? Compared side by side with your baseline over ${horizonDays} days (${mode}). Nothing is saved.`}
        action={<Icon name="layers" className="text-muted" />}
      />
      <CardContent className="flex flex-col gap-4">
        <ul className="flex flex-col gap-3">
          {drafts.map((d, i) => (
            <li key={d.key} className="rounded-[12px] border p-4">
              <div className="flex flex-wrap items-end gap-3">
                <Field label={`Scenario ${i + 1}`} htmlFor={`sc-type-${d.key}`} className="w-52">
                  <NativeSelect
                    id={`sc-type-${d.key}`}
                    value={d.type}
                    onChange={(e) => update(d.key, { type: e.target.value as ScenarioType })}
                  >
                    {(Object.keys(TYPE_LABEL) as ScenarioType[]).map((t) => (
                      <option key={t} value={t}>
                        {TYPE_LABEL[t]}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>

                {d.type === 'salary_delayed' || d.type === 'income_lost' ? (
                  <Field label="Income" htmlFor={`sc-inc-${d.key}`} className="w-56">
                    <NativeSelect
                      id={`sc-inc-${d.key}`}
                      value={d.incomeEventId}
                      onChange={(e) => update(d.key, { incomeEventId: e.target.value })}
                    >
                      <option value="">
                        {d.type === 'salary_delayed' ? 'All salary' : 'All income'}
                      </option>
                      {incomeEvents.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                ) : null}
                {d.type === 'salary_delayed' ? (
                  <Field label="Days late" htmlFor={`sc-days-${d.key}`} className="w-28">
                    <Input
                      id={`sc-days-${d.key}`}
                      inputMode="numeric"
                      className="tabular"
                      value={d.days}
                      onChange={(e) => update(d.key, { days: e.target.value.replace(/\D/g, '') })}
                    />
                  </Field>
                ) : null}
                {d.type === 'income_lost' ? (
                  <Field label="From" htmlFor={`sc-from-${d.key}`} className="w-44">
                    <DateInput
                      id={`sc-from-${d.key}`}
                      value={d.fromDate}
                      onChange={(e) => update(d.key, { fromDate: e.target.value })}
                    />
                  </Field>
                ) : null}

                {d.type === 'purchase_added' ? (
                  <>
                    <Field label="What" htmlFor={`sc-name-${d.key}`} className="w-44">
                      <Input
                        id={`sc-name-${d.key}`}
                        value={d.name}
                        maxLength={120}
                        placeholder="e.g. Phone"
                        onChange={(e) => update(d.key, { name: e.target.value })}
                      />
                    </Field>
                    <Field label="Amount" htmlFor={`sc-amt-${d.key}`} className="w-40">
                      <MoneyInput
                        id={`sc-amt-${d.key}`}
                        value={d.amount}
                        onChange={(e) => update(d.key, { amount: e.target.value })}
                      />
                    </Field>
                    <Field label="Date" htmlFor={`sc-date-${d.key}`} className="w-44">
                      <DateInput
                        id={`sc-date-${d.key}`}
                        value={d.date}
                        onChange={(e) => update(d.key, { date: e.target.value })}
                      />
                    </Field>
                    <Field label="Account" htmlFor={`sc-acc-${d.key}`} className="w-48">
                      <LookupAccountSelect
                        id={`sc-acc-${d.key}`}
                        value={d.accountId}
                        onChange={(v) => update(d.key, { accountId: v })}
                      />
                    </Field>
                    <Field
                      label="Installments"
                      htmlFor={`sc-inst-${d.key}`}
                      className="w-28"
                      optional
                    >
                      <Input
                        id={`sc-inst-${d.key}`}
                        inputMode="numeric"
                        className="tabular"
                        value={d.installments}
                        onChange={(e) =>
                          update(d.key, { installments: e.target.value.replace(/\D/g, '') })
                        }
                      />
                    </Field>
                  </>
                ) : null}

                {d.type === 'purchase_postponed' ? (
                  <>
                    <Field label="Planned item" htmlFor={`sc-ev-${d.key}`} className="w-60">
                      <NativeSelect
                        id={`sc-ev-${d.key}`}
                        value={d.eventId}
                        onChange={(e) => update(d.key, { eventId: e.target.value })}
                      >
                        <option value="">Choose…</option>
                        {outflowEvents.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.name} · {formatMoney(e.amount, { compactZeroCents: true })}
                          </option>
                        ))}
                      </NativeSelect>
                    </Field>
                    <Field label="New date" htmlFor={`sc-nd-${d.key}`} className="w-44">
                      <DateInput
                        id={`sc-nd-${d.key}`}
                        value={d.newDate}
                        onChange={(e) => update(d.key, { newDate: e.target.value })}
                      />
                    </Field>
                  </>
                ) : null}

                {d.type === 'spending_reduced' ? (
                  <Field label="Reduce by %" htmlFor={`sc-pct-${d.key}`} className="w-28">
                    <Input
                      id={`sc-pct-${d.key}`}
                      inputMode="numeric"
                      className="tabular"
                      value={d.percent}
                      onChange={(e) =>
                        update(d.key, { percent: e.target.value.replace(/\D/g, '') })
                      }
                    />
                  </Field>
                ) : null}

                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove scenario ${i + 1}`}
                  className="ml-auto"
                  disabled={drafts.length === 1}
                  onClick={() => setDrafts((list) => list.filter((x) => x.key !== d.key))}
                >
                  <Icon name="trash" size={16} />
                </Button>
              </div>
              {errors[d.key] ? (
                <p role="alert" className="mt-2 text-[12px] text-negative">
                  {errors[d.key]}
                </p>
              ) : null}
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={drafts.length >= 7}
            onClick={() => setDrafts((list) => [...list, emptyDraft('purchase_added', today)])}
          >
            <Icon name="plus" size={16} />
            Add scenario
          </Button>
          <Button variant="default" disabled={run.isPending} onClick={compare}>
            {run.isPending ? 'Comparing…' : 'Compare with baseline'}
          </Button>
        </div>

        {run.isError ? (
          <ErrorState error={run.error} title="Couldn't run the comparison" compact />
        ) : null}
        {result ? <ComparisonTable data={result.data} horizon={result.horizon} /> : null}
      </CardContent>
    </Card>
  );
}

function LookupAccountSelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const { accounts } = useLookups();
  return (
    <AccountSelect
      id={id}
      accounts={accounts}
      value={value}
      onChange={onChange}
      placeholder="Any"
    />
  );
}

function RiskLabel({ r }: { r: ScenarioResponse['comparisons'][number]['result'] }) {
  return r.firstShortfallDate ? (
    <span className="text-negative">Below zero {formatDate(r.firstShortfallDate, false)}</span>
  ) : r.firstBelowBufferDate ? (
    <span className="text-warning">Below buffer {formatDate(r.firstBelowBufferDate, false)}</span>
  ) : (
    <span className="text-positive">Above buffer</span>
  );
}

function ComparisonTable({ data, horizon }: { data: ScenarioResponse; horizon: number }) {
  return (
    <>
      {/* Phones: one card per scenario instead of a 720px-wide table. */}
      <ul
        className="flex flex-col gap-2 md:hidden"
        aria-label={`Scenario comparison over ${horizon} days`}
      >
        {data.comparisons.map((c, i) => {
          const baseline = c.scenario.type === 'baseline';
          const r = c.result;
          return (
            <li
              key={`${c.label}-${i}`}
              className={cn('rounded-[12px] border p-3 text-[13px]', baseline && 'bg-hover/50')}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate font-medium">{c.label}</span>
                {baseline ? <Badge tone="dark">Baseline</Badge> : null}
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
                <div>
                  <dt className="text-[11px] text-muted">Ending balance</dt>
                  <dd>
                    <Money value={r.endingBalance} tone="auto" />
                    {baseline ? null : (
                      <span className="block">
                        <Delta value={c.delta.endingBalance} />
                      </span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] text-muted">
                    Lowest · {formatDate(r.lowest.date, false)}
                  </dt>
                  <dd>
                    <Money value={r.lowest.balance} tone="auto" />
                    {baseline ? null : (
                      <span className="block">
                        <Delta value={c.delta.lowestBalance} />
                      </span>
                    )}
                  </dd>
                </div>
              </dl>
              <p className="mt-2 border-t pt-2">
                <RiskLabel r={r} />
              </p>
            </li>
          );
        })}
      </ul>
      <div className="hidden overflow-x-auto rounded-[12px] border md:block">
        <table className="w-full min-w-[720px] text-[13px]">
          <caption className="sr-only">Scenario comparison over {horizon} days</caption>
          <thead className="bg-canvas text-left">
            <tr>
              <th className="px-4 py-2.5 font-medium text-muted">Scenario</th>
              <th className="px-4 py-2.5 text-right font-medium text-muted">Ending balance</th>
              <th className="px-4 py-2.5 text-right font-medium text-muted">Δ ending</th>
              <th className="px-4 py-2.5 text-right font-medium text-muted">Lowest</th>
              <th className="px-4 py-2.5 text-right font-medium text-muted">Δ lowest</th>
              <th className="px-4 py-2.5 font-medium text-muted">Risk</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {data.comparisons.map((c, i) => {
              const baseline = c.scenario.type === 'baseline';
              const r = c.result;
              return (
                <tr key={`${c.label}-${i}`} className={cn(baseline && 'bg-hover/50 font-medium')}>
                  <td className="px-4 py-3">
                    {c.label}
                    {baseline ? (
                      <Badge tone="dark" className="ml-2">
                        Baseline
                      </Badge>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Money value={r.endingBalance} tone="auto" />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {baseline ? (
                      <span className="text-muted">—</span>
                    ) : (
                      <Delta value={c.delta.endingBalance} />
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Money value={r.lowest.balance} tone="auto" />
                    <span className="block text-[11px] text-muted">
                      {formatDate(r.lowest.date, false)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {baseline ? (
                      <span className="text-muted">—</span>
                    ) : (
                      <Delta value={c.delta.lowestBalance} />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <RiskLabel r={r} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Delta({ value }: { value: number }) {
  return (
    <span
      className={cn(
        'tabular font-medium',
        value > 0 ? 'text-positive' : value < 0 ? 'text-negative' : 'text-muted',
      )}
    >
      {formatMoney(value, { signed: true })}
    </span>
  );
}
