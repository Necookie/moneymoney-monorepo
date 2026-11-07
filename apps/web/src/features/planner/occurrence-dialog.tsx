'use client';

import type { OccurrenceDto, ScheduledEvent } from '@mm/api-client';
import { formatDate, formatMoney } from '@mm/finance-engine';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { AccountSelect, CategorySelect, DateInput, MoneyInput } from '@/components/form-controls';
import { Icon } from '@/components/icons/icon';
import { ConfidenceChip } from '@/components/money';
import { ProjectionNote } from '@/components/states';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/misc';
import { useApi } from '@/lib/api';
import {
  describeRecurrence,
  EVENT_KIND_LABEL,
  EVENT_STATUS_LABEL,
  moneyToInput,
  readMoney,
} from '@/lib/format';
import { invalidateFinancial, invalidatePlanning, useLookups, useToday } from '@/lib/queries';
import { newId } from '@/lib/utils';

type Mode = 'menu' | 'paid' | 'postpone' | 'split';

export function isOneOff(e: Pick<ScheduledEvent, 'recurrence' | 'installments'>): boolean {
  return e.recurrence.frequency === 'none' && !((e.installments ?? 0) > 1);
}

/** Details + actions for one dated occurrence of a planned item. */
export function OccurrenceDialogContent({
  occurrence: o,
  event,
  onEditSeries,
  onDone,
}: {
  occurrence: OccurrenceDto;
  event: ScheduledEvent | undefined;
  onEditSeries: () => void;
  onDone: () => void;
}) {
  const api = useApi();
  const qc = useQueryClient();
  const today = useToday();
  const { accounts, categories, accountName, categoryName } = useLookups();
  const inflow = o.direction === 'inflow';
  const [mode, setMode] = useState<Mode>('menu');
  const [confirm, setConfirm] = useState<'cancel' | 'delete' | 'skip' | null>(null);

  // Mark paid / received
  const [paidAmount, setPaidAmount] = useState(moneyToInput(o.amount));
  const [paidOn, setPaidOn] = useState(o.date <= today ? o.date : today);
  const [paidAccount, setPaidAccount] = useState(
    o.accountId ?? accounts.find((a) => !a.archived)?.id ?? '',
  );
  const [paidCategory, setPaidCategory] = useState(o.categoryId ?? '');
  // Postpone
  const [newDate, setNewDate] = useState(o.date < today ? today : o.date);
  // Split
  const [splitAmount, setSplitAmount] = useState('');
  const [splitDate, setSplitDate] = useState(o.date);
  const [splitName, setSplitName] = useState(`${o.name} (part)`);
  const [error, setError] = useState<string | null>(null);

  const done = (message: string, description?: string) => {
    toast.success(message, { description });
    onDone();
  };

  const markPaid = useMutation({
    mutationFn: (amount: number) =>
      api.planner.markPaid(o.eventId, {
        occurrenceDate: o.originalDate,
        transactionId: newId(),
        amount,
        occurredOn: paidOn,
        accountId: paidAccount,
        categoryId: paidCategory || null,
      }),
    onSuccess: (tx) =>
      done(
        inflow ? 'Marked as received' : 'Marked as paid',
        `Recorded an actual ${tx.type} of ${formatMoney(tx.amount)} — it no longer counts as planned.`,
      ),
    onSettled: () => invalidateFinancial(qc),
  });
  const postpone = useMutation({
    mutationFn: () => api.planner.postpone(o.eventId, o.originalDate, newDate),
    onSuccess: () => done(`Moved to ${formatDate(newDate)}`),
    onSettled: () => invalidatePlanning(qc),
  });
  const skip = useMutation({
    mutationFn: () => api.planner.skip(o.eventId, o.originalDate),
    onSuccess: () => done('Occurrence skipped'),
    onSettled: () => invalidatePlanning(qc),
  });
  const split = useMutation({
    mutationFn: (amount: number) =>
      api.planner.split(o.eventId, {
        amount,
        startDate: splitDate,
        name: splitName.trim() || undefined,
      }),
    onSuccess: (r) =>
      done(
        'Split into two items',
        `${formatMoney(r.original.amount)} stays · ${formatMoney(r.created.amount)} moved to ${formatDate(r.created.startDate)}`,
      ),
    onSettled: () => invalidatePlanning(qc),
  });
  const cancel = useMutation({
    mutationFn: () => api.planner.cancel(o.eventId),
    onSuccess: () => done('Planned item cancelled', 'It no longer affects projections.'),
    onSettled: () => invalidatePlanning(qc),
  });
  const remove = useMutation({
    mutationFn: () => api.planner.remove(o.eventId),
    onSuccess: () => done('Planned item deleted'),
    onSettled: () => invalidatePlanning(qc),
  });

  const actionable = !o.settled && !o.skipped;
  const canSplit = !!event && isOneOff(event) && actionable;

  function submitPaid(e: FormEvent) {
    e.preventDefault();
    const parsed = readMoney(paidAmount);
    if (!parsed.ok) return setError(parsed.error);
    if (!paidAccount) return setError('Choose the account the money moved through');
    setError(null);
    markPaid.mutate(parsed.value);
  }
  function submitSplit(e: FormEvent) {
    e.preventDefault();
    const parsed = readMoney(splitAmount);
    if (!parsed.ok) return setError(parsed.error);
    if (parsed.value >= o.amount) return setError(`Must be less than ${formatMoney(o.amount)}`);
    setError(null);
    split.mutate(parsed.value);
  }

  return (
    <DialogContent
      title={o.name}
      description={`${EVENT_KIND_LABEL[o.kind]} · ${formatDate(o.date)}`}
    >
      <DialogBody>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={
              inflow
                ? 'tabular text-[24px] font-semibold text-positive'
                : 'tabular text-[24px] font-semibold'
            }
          >
            {inflow ? '+' : '−'}
            {formatMoney(o.amount)}
          </span>
          <ConfidenceChip confidence={o.confidence} />
          <Badge tone="outline">{EVENT_STATUS_LABEL[o.status]}</Badge>
          {o.settled ? <Badge tone="positive">{inflow ? 'Received' : 'Paid'}</Badge> : null}
          {o.skipped ? <Badge tone="neutral">Skipped</Badge> : null}
          {o.overdue && !o.settled ? <Badge tone="negative">Overdue</Badge> : null}
          {o.rescheduled ? (
            <Badge tone="info">Moved from {formatDate(o.originalDate, false)}</Badge>
          ) : null}
        </div>
        {o.amountMin !== null || o.amountMax !== null ? (
          <p className="text-[13px] text-muted">
            Range {o.amountMin !== null ? formatMoney(o.amountMin) : '—'} –{' '}
            {o.amountMax !== null ? formatMoney(o.amountMax) : '—'}
          </p>
        ) : null}
        <dl className="grid grid-cols-2 gap-3 text-[13px]">
          <div>
            <dt className="text-muted">{inflow ? 'Into' : 'From'}</dt>
            <dd>{o.accountId ? accountName(o.accountId) : 'Not set'}</dd>
          </div>
          <div>
            <dt className="text-muted">Category</dt>
            <dd>{categoryName(o.categoryId)}</dd>
          </div>
          {event ? (
            <div className="col-span-2">
              <dt className="text-muted">Schedule</dt>
              <dd>
                {(event.installments ?? 0) > 1
                  ? `Installment ${o.index} of ${event.installments}`
                  : describeRecurrence(event.recurrence, event.startDate)}
              </dd>
            </div>
          ) : null}
          {event?.notes ? (
            <div className="col-span-2">
              <dt className="text-muted">Notes</dt>
              <dd className="whitespace-pre-wrap">{event.notes}</dd>
            </div>
          ) : null}
        </dl>

        {mode === 'paid' ? (
          <form
            id="occ-form"
            onSubmit={submitPaid}
            className="flex flex-col gap-4 rounded-[12px] border p-4"
          >
            <p className="text-[13px] text-muted">
              Creates an actual {inflow ? 'income' : 'expense'} transaction and settles this
              occurrence, so it is never counted twice.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Actual amount" htmlFor="occ-amount" error={error}>
                <MoneyInput
                  id="occ-amount"
                  autoFocus
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(e.target.value)}
                />
              </Field>
              <Field label="Date" htmlFor="occ-date">
                <DateInput
                  id="occ-date"
                  value={paidOn}
                  max={today}
                  onChange={(e) => setPaidOn(e.target.value)}
                />
              </Field>
              <Field label="Account" htmlFor="occ-account">
                <AccountSelect
                  id="occ-account"
                  accounts={accounts}
                  value={paidAccount}
                  onChange={setPaidAccount}
                  placeholder="Choose account"
                />
              </Field>
              <Field label="Category" htmlFor="occ-category" optional>
                <CategorySelect
                  id="occ-category"
                  categories={categories}
                  kind={inflow ? 'income' : 'expense'}
                  value={paidCategory}
                  onChange={setPaidCategory}
                />
              </Field>
            </div>
          </form>
        ) : null}

        {mode === 'postpone' ? (
          <div className="flex flex-col gap-3 rounded-[12px] border p-4">
            <Field label="New date" htmlFor="occ-new-date">
              <DateInput
                id="occ-new-date"
                autoFocus
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
              />
            </Field>
            <p className="text-[12px] text-muted">
              Only this occurrence moves; the rest of the schedule stays.
            </p>
          </div>
        ) : null}

        {mode === 'split' ? (
          <form
            id="occ-form"
            onSubmit={submitSplit}
            className="flex flex-col gap-4 rounded-[12px] border p-4"
          >
            <p className="text-[13px] text-muted">
              Move part of this amount to another date as a separate planned item.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Amount to move" htmlFor="split-amount" error={error}>
                <MoneyInput
                  id="split-amount"
                  autoFocus
                  value={splitAmount}
                  onChange={(e) => setSplitAmount(e.target.value)}
                />
              </Field>
              <Field label="New date" htmlFor="split-date">
                <DateInput
                  id="split-date"
                  value={splitDate}
                  onChange={(e) => setSplitDate(e.target.value)}
                />
              </Field>
            </div>
            <Field label="Name of the new item" htmlFor="split-name">
              <Input
                id="split-name"
                maxLength={120}
                value={splitName}
                onChange={(e) => setSplitName(e.target.value)}
              />
            </Field>
          </form>
        ) : null}

        <ProjectionNote>
          {o.settled
            ? 'Settled — the actual transaction is in Transactions.'
            : 'Planned — affects projections only until you mark it paid.'}
        </ProjectionNote>
      </DialogBody>

      <DialogFooter className="sm:justify-between">
        {mode === 'menu' ? (
          <>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" size="sm" onClick={onEditSeries} disabled={!event}>
                <Icon name="edit" size={14} />
                Edit item
              </Button>
              {event && event.status !== 'cancelled' && event.status !== 'paid' ? (
                <Button variant="ghost" size="sm" onClick={() => setConfirm('cancel')}>
                  <Icon name="xCircle" size={14} />
                  Cancel item
                </Button>
              ) : null}
              <Button
                variant="ghost"
                size="sm"
                className="text-negative"
                onClick={() => setConfirm('delete')}
              >
                <Icon name="trash" size={14} />
                Delete
              </Button>
            </div>
            {actionable ? (
              <div className="flex flex-wrap gap-2">
                {canSplit ? (
                  <Button variant="outline" size="sm" onClick={() => setMode('split')}>
                    <Icon name="split" size={14} />
                    Split
                  </Button>
                ) : null}
                <Button variant="outline" size="sm" onClick={() => setConfirm('skip')}>
                  <Icon name="skip" size={14} />
                  Skip
                </Button>
                <Button variant="outline" size="sm" onClick={() => setMode('postpone')}>
                  <Icon name="postpone" size={14} />
                  Postpone
                </Button>
                <Button variant="primary" size="sm" onClick={() => setMode('paid')}>
                  <Icon name="check" size={14} />
                  {inflow ? 'Mark received' : 'Mark paid'}
                </Button>
              </div>
            ) : null}
          </>
        ) : (
          <>
            <Button
              variant="outline"
              onClick={() => {
                setMode('menu');
                setError(null);
              }}
            >
              Back
            </Button>
            {mode === 'postpone' ? (
              <Button
                variant="primary"
                disabled={postpone.isPending || !newDate}
                onClick={() => postpone.mutate()}
              >
                {postpone.isPending ? 'Moving…' : 'Postpone'}
              </Button>
            ) : (
              <Button
                type="submit"
                form="occ-form"
                variant="primary"
                disabled={markPaid.isPending || split.isPending}
              >
                {mode === 'paid'
                  ? markPaid.isPending
                    ? 'Recording…'
                    : inflow
                      ? 'Record as received'
                      : 'Record as paid'
                  : split.isPending
                    ? 'Splitting…'
                    : 'Split'}
              </Button>
            )}
          </>
        )}
      </DialogFooter>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={
          confirm === 'skip'
            ? `Skip ${formatDate(o.date)}?`
            : confirm === 'cancel'
              ? `Cancel “${o.name}”?`
              : `Delete “${o.name}”?`
        }
        description={
          confirm === 'skip'
            ? event && isOneOff(event)
              ? 'This is a one-off item, so skipping it cancels it.'
              : 'Only this occurrence is skipped; the rest of the schedule stays.'
            : confirm === 'cancel'
              ? 'The whole item (all future occurrences) stops affecting projections. It stays in your list as cancelled.'
              : 'The planned item and its schedule are removed. Transactions already recorded from it are kept.'
        }
        confirmLabel={confirm === 'skip' ? 'Skip' : confirm === 'cancel' ? 'Cancel item' : 'Delete'}
        destructive={confirm !== 'skip'}
        pending={skip.isPending || cancel.isPending || remove.isPending}
        onConfirm={() => {
          if (confirm === 'skip') skip.mutate();
          if (confirm === 'cancel') cancel.mutate();
          if (confirm === 'delete') remove.mutate();
          setConfirm(null);
        }}
      />
    </DialogContent>
  );
}
