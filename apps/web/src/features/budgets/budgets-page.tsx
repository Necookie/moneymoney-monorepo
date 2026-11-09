'use client';

import type { Budget } from '@mm/api-client';
import { daysInMonth, formatMoney, formatMonth } from '@mm/finance-engine';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { MoneyInput } from '@/components/form-controls';
import { Icon } from '@/components/icons/icon';
import { Money } from '@/components/money';
import { EmptyState, ErrorState, PageHeader, SkeletonRows } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  ConfirmDialog,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Field } from '@/components/ui/field';
import { NativeSelect } from '@/components/ui/input';
import { Badge, ProgressBar, type BadgeTone, type BarTone } from '@/components/ui/misc';
import { useApi } from '@/lib/api';
import {
  BUDGET_STATE_LABEL,
  formatBps,
  moneyToInput,
  readMoney,
  shiftMonth,
  type BudgetState,
} from '@/lib/format';
import { FeatureDisabledState } from '@/components/feature-disabled-state';
import {
  invalidateKeys,
  qk,
  useBudgets,
  useCategories,
  useFeatures,
  useToday,
} from '@/lib/queries';
import { cn } from '@/lib/utils';

const STATE_TONE: Record<BudgetState, BadgeTone> = {
  ok: 'positive',
  approaching: 'warning',
  over_pace: 'warning',
  exceeded: 'negative',
};
const BAR_TONE: Record<BudgetState, BarTone> = {
  ok: 'ink',
  approaching: 'warning',
  over_pace: 'warning',
  exceeded: 'negative',
};

const BUDGET_KEYS = [qk.budgets, qk.dashboard, qk.forecast, qk.alerts];

export function BudgetsPage() {
  // Gate in a wrapper so the page's hooks never run conditionally.
  const features = useFeatures();
  if (!features.budgets) {
    return (
      <FeatureDisabledState
        featureName="Budgets"
        description="Enable Budgets in Settings to set monthly limits and monitor spending pace."
      />
    );
  }
  return <BudgetsContent />;
}

function BudgetsContent() {
  const today = useToday();
  const currentMonth = today.slice(0, 7);
  const [month, setMonth] = useState(currentMonth);
  const budgets = useBudgets(month);
  const categories = useCategories();
  const api = useApi();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Budget | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Budget | null>(null);

  const remove = useMutation({
    mutationFn: (id: string) => api.budgets.remove(id),
    onSuccess: () => toast.success('Budget removed'),
    onSettled: () => invalidateKeys(qc, BUDGET_KEYS),
  });

  const list = budgets.data ?? [];
  const overall = list.find((b) => b.categoryId === null) ?? null;
  const byCategory = list
    .filter((b) => b.categoryId !== null)
    .sort((a, b) => b.status.utilizationBps - a.status.utilizationBps);
  const categoryName = (id: string | null) =>
    categories.data?.find((c) => c.id === id)?.name ?? 'Unknown category';

  // Pace marker: share of the month elapsed (100% for past months, 0% for future ones).
  const [y, m] = month.split('-').map(Number) as [number, number];
  const pace =
    month < currentMonth
      ? 100
      : month > currentMonth
        ? 0
        : (Number(today.slice(8, 10)) / daysInMonth(y, m)) * 100;

  const totalLimit = byCategory.reduce((s, b) => s + b.amount, 0);
  const totalSpent = byCategory.reduce((s, b) => s + b.status.spent, 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Budgets"
        description="Monthly spending limits per category, plus an optional overall limit. Limits repeat every month."
        actions={
          <Button variant="primary" onClick={() => setEditing('new')}>
            <Icon name="plus" size={16} />
            Add budget
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          aria-label="Previous month"
          onClick={() => setMonth(shiftMonth(month, -1))}
        >
          <Icon name="chevronLeft" size={16} />
        </Button>
        <h2 className="min-w-32 text-center text-[17px] font-semibold" aria-live="polite">
          {formatMonth(month)}
        </h2>
        <Button
          variant="outline"
          size="icon"
          aria-label="Next month"
          onClick={() => setMonth(shiftMonth(month, 1))}
        >
          <Icon name="chevronRight" size={16} />
        </Button>
        {month !== currentMonth ? (
          <Button variant="ghost" size="sm" onClick={() => setMonth(currentMonth)}>
            This month
          </Button>
        ) : null}
      </div>

      {budgets.isError ? (
        <ErrorState error={budgets.error} onRetry={() => void budgets.refetch()} />
      ) : budgets.isPending ? (
        <Card className="p-5">
          <SkeletonRows rows={5} />
        </Card>
      ) : list.length === 0 ? (
        <EmptyState
          icon="budgets"
          title="No budgets yet"
          description="Set a monthly limit for categories like Food or Transport to get a daily allowance and early warnings."
          action={
            <Button variant="primary" size="sm" onClick={() => setEditing('new')}>
              Add a budget
            </Button>
          }
        />
      ) : (
        <div className={cn('flex flex-col gap-4', budgets.isPlaceholderData && 'opacity-60')}>
          {overall ? (
            <BudgetCard
              budget={overall}
              title="Overall monthly limit"
              pace={pace}
              highlight
              onEdit={() => setEditing(overall)}
              onDelete={() => setDeleting(overall)}
            />
          ) : (
            <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
              <div>
                <p className="font-medium">No overall limit</p>
                <p className="text-sm text-muted">
                  Category budgets total{' '}
                  <span className="tabular text-ink">{formatMoney(totalLimit)}</span> ·{' '}
                  <span className="tabular text-ink">{formatMoney(totalSpent)}</span> spent.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setEditing('new')}>
                Set an overall limit
              </Button>
            </Card>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            {byCategory.map((b) => (
              <BudgetCard
                key={b.id}
                budget={b}
                title={categoryName(b.categoryId)}
                pace={pace}
                onEdit={() => setEditing(b)}
                onDelete={() => setDeleting(b)}
              />
            ))}
          </div>
          <p className="text-[12px] text-muted">
            The tick on each bar marks how much of the month has passed. Refunds reduce spending;
            transfers never count.
          </p>
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        {editing !== null ? (
          <BudgetForm
            key={editing === 'new' ? 'new' : editing.id}
            budget={editing === 'new' ? null : editing}
            existing={list}
            onDone={() => setEditing(null)}
          />
        ) : null}
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Remove this budget?"
        description="The limit is removed for every month. Your transactions are not affected."
        confirmLabel="Remove budget"
        destructive
        pending={remove.isPending}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id);
          setDeleting(null);
        }}
      />
    </div>
  );
}

function BudgetCard({
  budget: b,
  title,
  pace,
  highlight,
  onEdit,
  onDelete,
}: {
  budget: Budget;
  title: string;
  pace: number;
  highlight?: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const s = b.status;
  return (
    <Card className={cn(highlight && 'border-border-strong')}>
      <CardHeader
        title={title}
        action={
          <>
            <Badge tone={STATE_TONE[s.state]}>{BUDGET_STATE_LABEL[s.state]}</Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${title} budget`}>
                  <Icon name="more" size={16} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onSelect={onEdit}>
                  <Icon name="edit" size={14} />
                  Change limit
                </DropdownMenuItem>
                <DropdownMenuItem destructive onSelect={onDelete}>
                  <Icon name="trash" size={14} />
                  Remove
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />
      <CardContent>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[15px]">
            <Money value={s.spent} className="text-[22px] font-semibold" />
            <span className="text-muted"> of </span>
            <Money value={b.amount} className="text-muted" />
          </p>
          <span className="tabular text-sm text-muted">{formatBps(s.utilizationBps)} used</span>
        </div>
        <ProgressBar
          className="mt-3"
          label={`${title} budget used`}
          value={s.utilizationBps / 100}
          tone={BAR_TONE[s.state]}
          marker={pace > 0 && pace < 100 ? pace : null}
        />
        <dl className="mt-4 grid grid-cols-3 gap-3 text-[13px]">
          <div>
            <dt className="text-muted">Remaining</dt>
            <dd>
              <Money value={s.remaining} tone="auto" className="font-medium" />
            </dd>
          </div>
          <div>
            <dt className="text-muted">Daily allowance</dt>
            <dd>
              <Money value={s.dailyAllowance} className="font-medium" />
              <span className="text-[11px] text-muted"> · {s.remainingDays}d left</span>
            </dd>
          </div>
          <div>
            <dt className="text-muted">At this pace</dt>
            <dd>
              <Money
                value={s.projectedSpend}
                tone={s.projectedSpend > b.amount ? 'negative' : 'neutral'}
                className="font-medium"
              />
            </dd>
          </div>
        </dl>
        {b.isDemo ? (
          <Badge tone="warning" className="mt-3">
            Demo
          </Badge>
        ) : null}
      </CardContent>
    </Card>
  );
}

function BudgetForm({
  budget,
  existing,
  onDone,
}: {
  budget: Budget | null;
  existing: Budget[];
  onDone: () => void;
}) {
  const api = useApi();
  const qc = useQueryClient();
  const categories = useCategories();
  const taken = new Set(existing.map((b) => b.categoryId ?? 'overall'));
  const options = (categories.data ?? []).filter(
    (c) => c.kind === 'expense' && !c.archived && !taken.has(c.id),
  );
  const [target, setTarget] = useState<string>(
    budget
      ? (budget.categoryId ?? 'overall')
      : taken.has('overall')
        ? (options[0]?.id ?? '')
        : 'overall',
  );
  const [amount, setAmount] = useState(moneyToInput(budget?.amount));
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (value: number) =>
      budget
        ? api.budgets.update(budget.id, { amount: value })
        : api.budgets.create({ categoryId: target === 'overall' ? null : target, amount: value }),
    onSuccess: () => {
      toast.success(budget ? 'Budget updated' : 'Budget added');
      onDone();
    },
    onSettled: () => invalidateKeys(qc, BUDGET_KEYS),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = readMoney(amount);
    if (!parsed.ok) return setError(parsed.error);
    if (!budget && !target) return setError('Choose a category');
    setError(null);
    save.mutate(parsed.value);
  }

  const categoryLabel =
    budget?.categoryId != null
      ? (categories.data?.find((c) => c.id === budget.categoryId)?.name ?? 'Category')
      : 'Overall limit';

  return (
    <DialogContent
      size="sm"
      title={budget ? `Change limit · ${categoryLabel}` : 'Add a monthly budget'}
      description="The limit applies to every month."
    >
      <form onSubmit={submit} noValidate>
        <DialogBody>
          {budget ? null : (
            <Field label="Applies to" htmlFor="budget-target">
              <NativeSelect
                id="budget-target"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              >
                {taken.has('overall') ? null : (
                  <option value="overall">Overall limit (all spending)</option>
                )}
                {options.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}
          <Field label="Monthly limit" htmlFor="budget-amount" error={error}>
            <MoneyInput
              id="budget-amount"
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : budget ? 'Save' : 'Add budget'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
