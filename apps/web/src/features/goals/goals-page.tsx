'use client';

import type { Goal } from '@mm/api-client';
import { GOAL_KINDS, type GoalKind } from '@mm/types';
import { formatDate, formatMoney } from '@mm/finance-engine';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { AccountSelect, DateInput, MoneyInput } from '@/components/form-controls';
import { Icon } from '@/components/icons/icon';
import { Money } from '@/components/money';
import { FeatureDisabledState } from '@/components/feature-disabled-state';
import { EmptyState, ErrorState, PageHeader, SkeletonRows } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Field } from '@/components/ui/field';
import { Input, NativeSelect } from '@/components/ui/input';
import { Badge, ProgressBar, Segmented, Skeleton, Switch } from '@/components/ui/misc';
import { useApi } from '@/lib/api';
import {
  formatBps,
  GOAL_KIND_LABEL,
  moneyToInput,
  readMoney,
  readOptionalMoney,
} from '@/lib/format';
import {
  invalidateKeys,
  qk,
  useAccounts,
  useGoalAllocations,
  useGoals,
  useMe,
  useToday,
} from '@/lib/queries';
import { cn } from '@/lib/utils';

const GOAL_KEYS = [qk.goals, qk.dashboard, qk.alerts, qk.forecast];

export function GoalsPage() {
  const goals = useGoals();
  const me = useMe();
  const params = useSearchParams();
  const router = useRouter();
  const api = useApi();
  const qc = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Goal | 'new' | null>(
    params.get('new') === '1' ? 'new' : null,
  );
  const [allocating, setAllocating] = useState<{ goal: Goal; mode: 'add' | 'withdraw' } | null>(
    null,
  );
  const [history, setHistory] = useState<Goal | null>(null);
  const [deleting, setDeleting] = useState<Goal | null>(null);

  if (me.data?.settings.features.goals === false) {
    return (
      <FeatureDisabledState
        featureName="Goals"
        description="Enable Goals in Settings to set savings targets and track emergency reserves."
      />
    );
  }

  const archive = useMutation({
    mutationFn: (g: Goal) => api.goals.update(g.id, { archived: !g.archived }),
    onSuccess: (g) => toast.success(g.archived ? 'Goal archived' : 'Goal restored'),
    onSettled: () => invalidateKeys(qc, GOAL_KEYS),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.goals.remove(id),
    onSuccess: () => toast.success('Goal deleted'),
    onSettled: () => invalidateKeys(qc, [...GOAL_KEYS, qk.me]),
  });

  const closeEditor = () => {
    setEditing(null);
    if (params.get('new')) router.replace('/goals');
  };

  const all = goals.data ?? [];
  const visible = all.filter((g) => showArchived || !g.archived);
  const archivedCount = all.filter((g) => g.archived).length;
  const emergencyId = me.data?.settings.emergencyFundGoalId ?? null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Goals"
        description="Savings targets with progress and projected completion. Allocations are earmarks, not expenses — they don't change your balances."
        actions={
          <Button variant="primary" onClick={() => setEditing('new')}>
            <Icon name="plus" size={16} />
            New goal
          </Button>
        }
      />

      {goals.isError ? (
        <ErrorState error={goals.error} onRetry={() => void goals.refetch()} />
      ) : goals.isPending ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-56 rounded-card" />
          ))}
        </div>
      ) : all.length === 0 ? (
        <EmptyState
          icon="goals"
          title="No goals yet"
          description="Start with an emergency fund — 3 to 6 months of expenses is a common target."
          action={
            <Button variant="primary" size="sm" onClick={() => setEditing('new')}>
              Create a goal
            </Button>
          }
        />
      ) : (
        <>
          {archivedCount > 0 ? (
            <label className="flex items-center gap-2 self-end text-[13px] text-muted">
              <Switch checked={showArchived} onCheckedChange={setShowArchived} />
              Show {archivedCount} archived
            </label>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2">
            {visible.map((g) => (
              <GoalCard
                key={g.id}
                goal={g}
                isEmergencyFund={g.id === emergencyId}
                onAllocate={(mode) => setAllocating({ goal: g, mode })}
                onHistory={() => setHistory(g)}
                onEdit={() => setEditing(g)}
                onArchive={() => archive.mutate(g)}
                onDelete={() => setDeleting(g)}
              />
            ))}
          </div>
        </>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && closeEditor()}>
        {editing !== null ? (
          <GoalForm
            key={editing === 'new' ? 'new' : editing.id}
            goal={editing === 'new' ? null : editing}
            onDone={closeEditor}
          />
        ) : null}
      </Dialog>

      <Dialog open={allocating !== null} onOpenChange={(o) => !o && setAllocating(null)}>
        {allocating ? (
          <AllocationForm
            key={`${allocating.goal.id}-${allocating.mode}`}
            goal={allocating.goal}
            initialMode={allocating.mode}
            onDone={() => setAllocating(null)}
          />
        ) : null}
      </Dialog>

      <Dialog open={history !== null} onOpenChange={(o) => !o && setHistory(null)}>
        {history ? <AllocationHistory goal={history} /> : null}
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete “${deleting?.name ?? ''}”?`}
        description="The goal and its allocation history are removed. Your balances are not affected."
        confirmLabel="Delete goal"
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

function GoalCard({
  goal: g,
  isEmergencyFund,
  onAllocate,
  onHistory,
  onEdit,
  onArchive,
  onDelete,
}: {
  goal: Goal;
  isEmergencyFund: boolean;
  onAllocate: (mode: 'add' | 'withdraw') => void;
  onHistory: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const p = g.projection;
  return (
    <Card className={cn('flex flex-col p-5', g.archived && 'opacity-60')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[17px] font-semibold">{g.name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge tone="neutral">{GOAL_KIND_LABEL[g.kind]}</Badge>
            {isEmergencyFund ? <Badge tone="info">Emergency fund</Badge> : null}
            {p.complete ? (
              <Badge tone="positive">Complete</Badge>
            ) : p.onTrack === true ? (
              <Badge tone="positive">On track</Badge>
            ) : p.onTrack === false ? (
              <Badge tone="warning">Behind</Badge>
            ) : null}
            {g.archived ? <Badge tone="outline">Archived</Badge> : null}
            {g.isDemo ? <Badge tone="warning">Demo</Badge> : null}
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${g.name}`}>
              <Icon name="more" size={16} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={() => onAllocate('withdraw')}>
              <Icon name="minus" size={14} />
              Withdraw
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onHistory}>
              <Icon name="clock" size={14} />
              Allocation history
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onEdit}>
              <Icon name="edit" size={14} />
              Edit goal
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onArchive}>
              <Icon name="archive" size={14} />
              {g.archived ? 'Restore' : 'Archive'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={onDelete}>
              <Icon name="trash" size={14} />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-5 flex flex-wrap items-baseline justify-between gap-2">
        <p>
          <Money value={g.currentAmount} className="text-[24px] font-semibold tracking-tight" />
          <span className="text-muted"> of </span>
          <Money value={g.targetAmount} className="text-muted" />
        </p>
        <span className="tabular text-sm text-muted">{formatBps(p.progressBps)}</span>
      </div>
      <ProgressBar
        className="mt-3"
        label={`${g.name} progress`}
        value={p.progressBps / 100}
        tone={p.complete ? 'positive' : 'ink'}
      />

      <dl className="mt-4 grid grid-cols-2 gap-3 text-[13px]">
        <div>
          <dt className="text-muted">Remaining</dt>
          <dd className="tabular font-medium">{formatMoney(Math.max(0, p.remaining))}</dd>
        </div>
        <div>
          <dt className="text-muted">Target date</dt>
          <dd className="font-medium">{g.targetDate ? formatDate(g.targetDate) : 'None'}</dd>
        </div>
        <div>
          <dt className="text-muted">Monthly contribution</dt>
          <dd className="tabular font-medium">
            {g.monthlyContribution ? formatMoney(g.monthlyContribution) : 'Not set'}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Estimated completion</dt>
          <dd className="font-medium">
            {p.complete
              ? 'Reached'
              : p.estimatedCompletionDate
                ? formatDate(p.estimatedCompletionDate)
                : 'Set a contribution'}
          </dd>
        </div>
      </dl>
      {p.requiredMonthlyContribution !== null && !p.complete && g.targetDate ? (
        <p className="mt-3 text-[12px] text-muted">
          To finish by {formatDate(g.targetDate)}, set aside{' '}
          <span className="tabular font-medium text-ink">
            {formatMoney(p.requiredMonthlyContribution)}
          </span>{' '}
          a month.
        </p>
      ) : null}

      <div className="mt-5 flex gap-2">
        <Button variant="default" size="sm" onClick={() => onAllocate('add')} disabled={g.archived}>
          <Icon name="plus" size={14} />
          Allocate
        </Button>
        <Button variant="outline" size="sm" onClick={onHistory}>
          History
        </Button>
      </div>
    </Card>
  );
}

function GoalForm({ goal, onDone }: { goal: Goal | null; onDone: () => void }) {
  const api = useApi();
  const qc = useQueryClient();
  const accounts = useAccounts();
  const [name, setName] = useState(goal?.name ?? '');
  const [kind, setKind] = useState<GoalKind>(goal?.kind ?? 'emergency');
  const [target, setTarget] = useState(moneyToInput(goal?.targetAmount));
  const [targetDate, setTargetDate] = useState(goal?.targetDate ?? '');
  const [monthly, setMonthly] = useState(moneyToInput(goal?.monthlyContribution));
  const [accountId, setAccountId] = useState(goal?.accountId ?? '');
  const [initial, setInitial] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: (body: {
      name: string;
      kind: GoalKind;
      targetAmount: number;
      targetDate: string | null;
      monthlyContribution: number | null;
      accountId: string | null;
      initialAmount?: number;
    }) => {
      if (goal) {
        const { initialAmount: _ignored, ...patch } = body;
        return api.goals.update(goal.id, patch);
      }
      return api.goals.create(body);
    },
    onSuccess: () => {
      toast.success(goal ? 'Goal updated' : 'Goal created');
      onDone();
    },
    onSettled: () => invalidateKeys(qc, GOAL_KEYS),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = 'Name the goal';
    const t = readMoney(target);
    if (!t.ok) next.target = t.error;
    const mo = readOptionalMoney(monthly);
    if (!mo.ok) next.monthly = mo.error;
    const init = readOptionalMoney(initial);
    if (!init.ok) next.initial = init.error;
    setErrors(next);
    if (!t.ok || !mo.ok || !init.ok || Object.keys(next).length) return;
    save.mutate({
      name: name.trim(),
      kind,
      targetAmount: t.value,
      targetDate: targetDate || null,
      monthlyContribution: mo.value,
      accountId: accountId || null,
      ...(goal || !init.value ? {} : { initialAmount: init.value }),
    });
  }

  return (
    <DialogContent title={goal ? 'Edit goal' : 'New goal'}>
      <form onSubmit={submit} noValidate>
        <DialogBody>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="goal-name" error={errors.name}>
              <Input
                id="goal-name"
                autoFocus
                maxLength={120}
                value={name}
                placeholder="e.g. Emergency fund"
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field label="Type" htmlFor="goal-kind">
              <NativeSelect
                id="goal-kind"
                value={kind}
                onChange={(e) => setKind(e.target.value as GoalKind)}
              >
                {GOAL_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {GOAL_KIND_LABEL[k]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Target amount" htmlFor="goal-target" error={errors.target}>
              <MoneyInput
                id="goal-target"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              />
            </Field>
            <Field label="Target date" htmlFor="goal-date" optional>
              <DateInput
                id="goal-date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Monthly contribution"
              htmlFor="goal-monthly"
              optional
              error={errors.monthly}
              hint="Used to estimate the completion date"
            >
              <MoneyInput
                id="goal-monthly"
                value={monthly}
                onChange={(e) => setMonthly(e.target.value)}
              />
            </Field>
            <Field label="Held in account" htmlFor="goal-account" optional>
              <AccountSelect
                id="goal-account"
                accounts={accounts.data ?? []}
                value={accountId}
                onChange={setAccountId}
                placeholder="Not linked"
              />
            </Field>
          </div>
          {goal ? null : (
            <Field
              label="Already saved"
              htmlFor="goal-initial"
              optional
              error={errors.initial}
              hint="Recorded as the first allocation (an earmark, not an expense)"
            >
              <MoneyInput
                id="goal-initial"
                value={initial}
                onChange={(e) => setInitial(e.target.value)}
              />
            </Field>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : goal ? 'Save changes' : 'Create goal'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function AllocationForm({
  goal,
  initialMode,
  onDone,
}: {
  goal: Goal;
  initialMode: 'add' | 'withdraw';
  onDone: () => void;
}) {
  const api = useApi();
  const qc = useQueryClient();
  const today = useToday();
  const [mode, setMode] = useState(initialMode);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (value: number) =>
      api.goals.allocate(goal.id, {
        amount: mode === 'add' ? value : -value,
        allocatedOn: date,
        note: note.trim() || null,
      }),
    onSuccess: (a) => {
      toast.success(
        a.amount > 0
          ? `${formatMoney(a.amount)} allocated to ${goal.name}`
          : `${formatMoney(-a.amount)} withdrawn from ${goal.name}`,
      );
      onDone();
    },
    onSettled: () => invalidateKeys(qc, [...GOAL_KEYS, qk.goalAllocations(goal.id)]),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = readMoney(amount);
    if (!parsed.ok) return setError(parsed.error);
    if (mode === 'withdraw' && parsed.value > goal.currentAmount)
      return setError(`You can withdraw at most ${formatMoney(goal.currentAmount)}`);
    setError(null);
    save.mutate(parsed.value);
  }

  return (
    <DialogContent
      size="sm"
      title={goal.name}
      description="An earmark only — no money moves between accounts and balances don't change."
    >
      <form onSubmit={submit} noValidate>
        <DialogBody>
          <Segmented
            label="Allocation direction"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'add', label: 'Allocate' },
              { value: 'withdraw', label: 'Withdraw' },
            ]}
            className="self-start"
          />
          <Field label="Amount" htmlFor="alloc-amount" error={error}>
            <MoneyInput
              id="alloc-amount"
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
          <Field label="Date" htmlFor="alloc-date">
            <DateInput
              id="alloc-date"
              value={date}
              max={today}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Field label="Note" htmlFor="alloc-note" optional>
            <Input
              id="alloc-note"
              maxLength={200}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : mode === 'add' ? 'Allocate' : 'Withdraw'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function AllocationHistory({ goal }: { goal: Goal }) {
  const api = useApi();
  const qc = useQueryClient();
  const allocations = useGoalAllocations(goal.id);
  const remove = useMutation({
    mutationFn: (allocationId: string) => api.goals.removeAllocation(goal.id, allocationId),
    onSuccess: () => toast.success('Allocation removed'),
    onSettled: () => invalidateKeys(qc, [...GOAL_KEYS, qk.goalAllocations(goal.id)]),
  });
  return (
    <DialogContent title={`${goal.name} · history`} description="Allocations and withdrawals.">
      <DialogBody>
        {allocations.isError ? (
          <ErrorState
            error={allocations.error}
            onRetry={() => void allocations.refetch()}
            compact
          />
        ) : allocations.isPending ? (
          <SkeletonRows rows={4} />
        ) : allocations.data.length === 0 ? (
          <p className="text-sm text-muted">No allocations yet.</p>
        ) : (
          <ul className="divide-y">
            {allocations.data.map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium">
                    {a.amount > 0 ? 'Allocated' : 'Withdrawn'}
                  </p>
                  <p className="truncate text-[12px] text-muted">
                    {formatDate(a.allocatedOn)}
                    {a.note ? ` · ${a.note}` : ''}
                  </p>
                </div>
                <Money
                  value={a.amount}
                  signed
                  tone={a.amount > 0 ? 'positive' : 'neutral'}
                  className="text-[14px] font-medium"
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Remove allocation"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(a.id)}
                >
                  <Icon name="trash" size={14} />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogBody>
    </DialogContent>
  );
}
