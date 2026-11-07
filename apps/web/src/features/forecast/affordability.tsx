'use client';

import type { AffordabilityRequest, AffordabilityResponse } from '@mm/api-client';
import { formatDate, formatMoney } from '@mm/finance-engine';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { AccountSelect, CategorySelect, DateInput, MoneyInput } from '@/components/form-controls';
import { Icon } from '@/components/icons/icon';
import { Money } from '@/components/money';
import { ErrorState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Badge, Segmented, type BadgeTone } from '@/components/ui/misc';
import { useApi } from '@/lib/api';
import { readMoney } from '@/lib/format';
import { invalidatePlanning, useLookups, useToday } from '@/lib/queries';
import { cn } from '@/lib/utils';

const VERDICT: Record<
  AffordabilityResponse['verdict'],
  { title: string; tone: BadgeTone; summary: string }
> = {
  comfortable: {
    title: 'Comfortably affordable',
    tone: 'positive',
    summary:
      'You can pay for this and still cover everything planned while staying above your buffer.',
  },
  tight: {
    title: 'Affordable, but tight',
    tone: 'warning',
    summary:
      'Obligations stay covered, but your balance gets close to or below your safety buffer.',
  },
  compromises_emergency_fund: {
    title: 'Eats into your emergency fund',
    tone: 'warning',
    summary: 'Paying for this would dip into money reserved for emergencies.',
  },
  creates_shortfall: {
    title: 'Creates a shortfall later',
    tone: 'negative',
    summary: 'You could pay today, but upcoming bills would no longer be covered.',
  },
  not_affordable_today: {
    title: 'Not affordable today',
    tone: 'negative',
    summary: 'Your current balance does not cover the first payment.',
  },
};

/** "Can I afford this?" — a pure simulation. Saving is a separate, explicit action. */
export function AffordabilityCard() {
  const api = useApi();
  const qc = useQueryClient();
  const today = useToday();
  const { accounts, categories } = useLookups();
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [date, setDate] = useState(today);
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [plan, setPlan] = useState<'full' | 'installments'>('full');
  const [installments, setInstallments] = useState('3');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [request, setRequest] = useState<AffordabilityRequest | null>(null);
  const [saved, setSaved] = useState(false);

  const check = useMutation({
    mutationFn: (body: AffordabilityRequest) => api.forecast.affordability(body),
    meta: { silent: true },
  });

  const savePlanned = useMutation({
    mutationFn: (body: AffordabilityRequest) =>
      api.planner.create({
        name: body.name?.trim() || 'Planned purchase',
        direction: 'outflow',
        kind: 'purchase',
        status: 'planned',
        confidence: 'confirmed',
        amount: body.amount,
        currency: 'PHP',
        startDate: body.date,
        accountId: body.accountId ?? null,
        categoryId: body.categoryId ?? null,
        installments: body.installments ?? null,
      }),
    onSuccess: () => {
      setSaved(true);
      toast.success('Saved as a planned purchase', {
        description: 'It now appears in your Financial Calendar and projections.',
      });
    },
    onSettled: () => invalidatePlanning(qc),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    const amount = readMoney(price);
    if (!amount.ok) next.price = amount.error;
    if (!date) next.date = 'Choose a date';
    const count = Number(installments);
    if (plan === 'installments' && (!Number.isInteger(count) || count < 2 || count > 120))
      next.installments = 'Between 2 and 120';
    setErrors(next);
    if (!amount.ok || Object.keys(next).length) return;
    const body: AffordabilityRequest = {
      name: name.trim() || undefined,
      amount: amount.value,
      date,
      accountId: accountId || null,
      categoryId: categoryId || null,
      installments: plan === 'installments' ? count : null,
      horizonDays: 120,
    };
    setRequest(body);
    setSaved(false);
    check.mutate(body);
  }

  return (
    <Card>
      <CardHeader
        title="Can I afford this?"
        description="Simulates a purchase against everything already planned. Nothing is saved unless you choose to."
        action={<Icon name="sparkles" className="text-muted" />}
      />
      <CardContent>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <form onSubmit={submit} noValidate className="flex flex-col gap-4">
            <Field label="What is it?" htmlFor="aff-name" optional>
              <Input
                id="aff-name"
                maxLength={120}
                placeholder="e.g. New laptop"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Price" htmlFor="aff-price" error={errors.price}>
                <MoneyInput
                  id="aff-price"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </Field>
              <Field label="Purchase date" htmlFor="aff-date" error={errors.date}>
                <DateInput
                  id="aff-date"
                  value={date}
                  min={today}
                  onChange={(e) => setDate(e.target.value)}
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Pay from" htmlFor="aff-account" optional>
                <AccountSelect
                  id="aff-account"
                  accounts={accounts}
                  value={accountId}
                  onChange={setAccountId}
                  placeholder="Any account"
                />
              </Field>
              <Field label="Category" htmlFor="aff-category" optional>
                <CategorySelect
                  id="aff-category"
                  categories={categories}
                  kind="expense"
                  value={categoryId}
                  onChange={setCategoryId}
                />
              </Field>
            </div>
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium">Payment</span>
                <Segmented
                  label="Payment plan"
                  size="sm"
                  value={plan}
                  onChange={setPlan}
                  options={[
                    { value: 'full', label: 'Pay in full' },
                    { value: 'installments', label: 'Installments' },
                  ]}
                />
              </div>
              {plan === 'installments' ? (
                <Field
                  label="Months"
                  htmlFor="aff-inst"
                  error={errors.installments}
                  className="w-28"
                >
                  <Input
                    id="aff-inst"
                    inputMode="numeric"
                    className="tabular"
                    value={installments}
                    onChange={(e) => setInstallments(e.target.value.replace(/\D/g, ''))}
                  />
                </Field>
              ) : null}
            </div>
            <Button
              type="submit"
              variant="default"
              disabled={check.isPending}
              className="self-start"
            >
              {check.isPending ? 'Simulating…' : 'Check affordability'}
            </Button>
          </form>

          <div aria-live="polite">
            {check.isError ? (
              <ErrorState error={check.error} title="Couldn't run the simulation" compact />
            ) : check.data && request ? (
              <Verdict
                result={check.data}
                request={request}
                saved={saved}
                saving={savePlanned.isPending}
                onSave={() => savePlanned.mutate(request)}
              />
            ) : (
              <div className="flex h-full min-h-48 flex-col items-center justify-center gap-2 rounded-[12px] border border-dashed p-6 text-center text-sm text-muted">
                <Icon name="sparkles" size={20} />
                Enter a price and date to see whether it fits — today and against your future
                obligations.
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-start gap-2 text-[14px]">
      <Icon
        name={ok ? 'checkCircle' : 'xCircle'}
        size={18}
        className={cn('mt-0.5', ok ? 'text-positive' : 'text-negative')}
      />
      <span>
        <span className="font-medium">{label}</span>
        <span className="text-muted"> — {ok ? 'Yes' : 'No'}</span>
      </span>
    </li>
  );
}

function Verdict({
  result: r,
  request,
  saved,
  saving,
  onSave,
}: {
  result: AffordabilityResponse;
  request: AffordabilityRequest;
  saved: boolean;
  saving: boolean;
  onSave: () => void;
}) {
  const v = VERDICT[r.verdict];
  const lowestDelta = r.lowest.balance - r.baselineLowest.balance;
  return (
    <div
      className={cn(
        'flex flex-col gap-4 rounded-[14px] border p-5',
        v.tone === 'positive' && 'border-positive/30',
        v.tone === 'warning' && 'border-warning/40',
        v.tone === 'negative' && 'border-negative/40',
      )}
    >
      <div>
        <Badge tone={v.tone}>{v.title}</Badge>
        <p className="mt-2 text-[15px]">
          {request.name ? <span className="font-medium">{request.name}: </span> : null}
          {v.summary}
        </p>
      </div>
      <ul className="flex flex-col gap-1.5">
        <Check ok={r.affordableToday} label="Affordable today" />
        <Check
          ok={r.affordableWithoutCompromise}
          label="Affordable without compromising future obligations"
        />
      </ul>

      <dl className="grid grid-cols-2 gap-3 border-t pt-4 text-[13px] sm:grid-cols-3">
        <div>
          <dt className="text-muted">{request.installments ? 'First installment' : 'Payment'}</dt>
          <dd>
            <Money value={r.firstPayment} className="font-medium" />
          </dd>
        </div>
        <div>
          <dt className="text-muted">Balance right after</dt>
          <dd>
            <Money value={r.balanceAfterPurchase} tone="auto" className="font-medium" />
          </dd>
        </div>
        <div>
          <dt className="text-muted">Lowest ahead</dt>
          <dd>
            <Money value={r.lowest.balance} tone="auto" className="font-medium" />
            <span className="block text-[11px] text-muted">
              {formatDate(r.lowest.date)} · {formatMoney(lowestDelta, { signed: true })} vs now
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-muted">Conservative lowest</dt>
          <dd>
            <Money value={r.conservativeLowest.balance} tone="auto" className="font-medium" />
            <span className="block text-[11px] text-muted">
              {formatDate(r.conservativeLowest.date)}
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-muted">Buffer headroom</dt>
          <dd>
            <Money value={r.bufferHeadroom} tone="auto" className="font-medium" />
            <span className="block text-[11px] text-muted">
              Buffer {formatMoney(r.safetyBuffer)}
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-muted">Emergency fund</dt>
          <dd
            className={cn(
              'font-medium',
              r.emergencyFund.compromised ? 'text-negative' : 'text-positive',
            )}
          >
            {r.emergencyFund.compromised
              ? `Short by ${formatMoney(r.emergencyFund.shortfall)}`
              : r.emergencyFund.reserved > 0
                ? 'Untouched'
                : 'None reserved'}
            {r.emergencyFund.reserved > 0 ? (
              <span className="block text-[11px] font-normal text-muted">
                {formatMoney(r.emergencyFund.reserved)} reserved
              </span>
            ) : null}
          </dd>
        </div>
      </dl>

      {r.firstShortfallDate ? (
        <p className="flex items-center gap-1.5 text-[13px] text-negative">
          <Icon name="alertCircle" size={16} />
          Balance would go below zero on {formatDate(r.firstShortfallDate)}.
        </p>
      ) : null}

      {r.affectedObligations.length > 0 ? (
        <div>
          <p className="section-label mb-2">Obligations put at risk</p>
          <ul className="divide-y rounded-[10px] border text-[13px]">
            {r.affectedObligations.map((o, i) => (
              <li
                key={`${o.date}-${o.name}-${i}`}
                className="flex items-center justify-between gap-3 px-3 py-2"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{o.name}</span>
                  <span className="text-[12px] text-muted">{formatDate(o.date)}</span>
                </span>
                <span className="text-right">
                  <Money value={o.amount} className="block" />
                  <span className="text-[11px] text-muted">
                    balance after <Money value={o.balanceAfter} tone="auto" />
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {r.reasons.length > 0 ? (
        <ul className="flex list-disc flex-col gap-1 pl-5 text-[13px] text-ink-soft marker:text-muted">
          {r.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-t pt-4">
        {saved ? (
          <>
            <Badge tone="positive">Saved to your calendar</Badge>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/calendar">Open calendar</Link>
            </Button>
          </>
        ) : (
          <Button variant="outline" disabled={saving} onClick={onSave}>
            <Icon name="calendar" size={16} />
            {saving ? 'Saving…' : 'Save as planned purchase'}
          </Button>
        )}
        {saved ? null : (
          <span className="text-[12px] text-muted">This was a simulation — nothing was saved.</span>
        )}
      </div>
    </div>
  );
}
