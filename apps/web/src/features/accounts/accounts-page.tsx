'use client';

import type { Account } from '@mm/api-client';
import type { AccountType } from '@mm/types';
import { ACCOUNT_TYPES } from '@mm/types';
import { formatDate, formatMoney } from '@mm/finance-engine';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { DateInput, MoneyInput } from '@/components/form-controls';
import { Icon, type IconName } from '@/components/icons/icon';
import { Figure } from '@/components/money';
import { EmptyState, ErrorState, PageHeader } from '@/components/states';
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
import { Badge, Skeleton, Switch } from '@/components/ui/misc';
import { errorMessage, isApiError, useApi } from '@/lib/api';
import { ACCOUNT_TYPE_LABEL, moneyToInput, readMoney } from '@/lib/format';
import { FeatureDisabledState } from '@/components/feature-disabled-state';
import { invalidateFinancial, useAccounts, useMe, useToday } from '@/lib/queries';
import { cn } from '@/lib/utils';

const TYPE_ICON: Record<AccountType, IconName> = {
  cash: 'cash',
  bank: 'bank',
  ewallet: 'wallet',
  savings: 'savings',
  credit: 'creditCard',
};

export function AccountsPage() {
  const me = useMe();
  const accounts = useAccounts();
  const params = useSearchParams();
  const router = useRouter();
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Account | 'new' | null>(
    params.get('new') === '1' ? 'new' : null,
  );
  const [deleting, setDeleting] = useState<Account | null>(null);
  const api = useApi();
  const qc = useQueryClient();

  if (me.data?.settings.features.accounts === false) {
    return (
      <FeatureDisabledState
        featureName="Accounts"
        description="Enable Accounts in Settings to manage cash, bank, e-wallet, savings, and credit accounts."
      />
    );
  }

  const closeEditor = () => {
    setEditing(null);
    if (params.get('new')) router.replace('/accounts');
  };

  const archive = useMutation({
    mutationFn: (a: Account) => api.accounts.update(a.id, { archived: !a.archived }),
    onSuccess: (a) => toast.success(a.archived ? `${a.name} archived` : `${a.name} restored`),
    onSettled: () => invalidateFinancial(qc),
  });

  const remove = useMutation({
    mutationFn: (a: Account) => api.accounts.remove(a.id),
    meta: { silent: true },
    onSuccess: () => toast.success('Account deleted'),
    onError: (err) => {
      if (isApiError(err) && err.status === 409) {
        toast.error('This account has transactions or planned items', {
          description: 'Archive it instead — history is kept and it disappears from pickers.',
        });
      } else {
        toast.error(errorMessage(err), {
          description:
            isApiError(err) && err.requestId ? `Request ID: ${err.requestId}` : undefined,
        });
      }
    },
    onSettled: () => invalidateFinancial(qc),
  });

  const all = accounts.data ?? [];
  const visible = all.filter((a) => showArchived || !a.archived);
  const active = all.filter((a) => !a.archived);
  const assets = active.filter((a) => a.type !== 'credit').reduce((s, a) => s + a.balance, 0);
  const owed = active
    .filter((a) => a.type === 'credit')
    .reduce((s, a) => s + Math.max(0, -a.balance), 0);
  const archivedCount = all.length - active.length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Accounts"
        description="Cash, bank, e-wallet, savings and credit cards. Balances include every recorded transaction."
        actions={
          <Button variant="primary" onClick={() => setEditing('new')}>
            <Icon name="plus" size={16} />
            Add account
          </Button>
        }
      />

      {accounts.isError ? (
        <ErrorState error={accounts.error} onRetry={() => void accounts.refetch()} />
      ) : accounts.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-40 rounded-card" />
          ))}
        </div>
      ) : all.length === 0 ? (
        <EmptyState
          icon="accounts"
          title="No accounts yet"
          description="Add where your money lives — with today's balance — to start tracking and forecasting."
          action={
            <Button variant="primary" size="sm" onClick={() => setEditing('new')}>
              Add your first account
            </Button>
          }
        />
      ) : (
        <>
          <Card className="grid gap-4 p-5 sm:grid-cols-3">
            <Figure label="Net (actual)" value={assets - owed} />
            <Figure label="Cash & savings" value={assets} tone="neutral" />
            <Figure label="Owed on credit" value={owed} tone={owed > 0 ? 'negative' : 'neutral'} />
          </Card>

          {archivedCount > 0 ? (
            <label className="flex items-center gap-2 self-end text-[13px] text-muted">
              <Switch checked={showArchived} onCheckedChange={setShowArchived} />
              Show {archivedCount} archived
            </label>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((a) => (
              <AccountCard
                key={a.id}
                account={a}
                onEdit={() => setEditing(a)}
                onArchive={() => archive.mutate(a)}
                onDelete={() => setDeleting(a)}
              />
            ))}
          </div>
        </>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && closeEditor()}>
        {editing !== null ? (
          <AccountForm
            key={editing === 'new' ? 'new' : editing.id}
            account={editing === 'new' ? null : editing}
            onDone={closeEditor}
          />
        ) : null}
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.name ?? 'account'}?`}
        description="Only accounts with no transactions or planned items can be deleted. Otherwise, archive the account to keep its history."
        confirmLabel="Delete account"
        destructive
        pending={remove.isPending}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting);
          setDeleting(null);
        }}
      />
    </div>
  );
}

function AccountCard({
  account: a,
  onEdit,
  onArchive,
  onDelete,
}: {
  account: Account;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const credit = a.type === 'credit';
  const owed = credit ? -a.balance : 0;
  return (
    <Card className={cn('flex flex-col p-5', a.archived && 'opacity-60')}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-hover">
            <Icon name={TYPE_ICON[a.type]} size={18} />
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium">{a.name}</p>
            <p className="text-[12px] text-muted">{ACCOUNT_TYPE_LABEL[a.type]}</p>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${a.name}`}>
              <Icon name="more" size={16} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={onEdit}>
              <Icon name="edit" size={14} />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/transactions?account=${a.id}`}>
                <Icon name="transactions" size={14} />
                View transactions
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onArchive}>
              <Icon name="archive" size={14} />
              {a.archived ? 'Restore' : 'Archive'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={onDelete}>
              <Icon name="trash" size={14} />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="mt-6">
        <div className="section-label">{credit ? 'Amount owed' : 'Balance'}</div>
        <p
          className={cn(
            'tabular mt-1 text-[24px] leading-[30px] font-semibold tracking-tight',
            credit ? (owed > 0 ? 'text-negative' : 'text-ink') : a.balance < 0 && 'text-negative',
          )}
        >
          {credit
            ? owed >= 0
              ? formatMoney(owed)
              : `${formatMoney(-owed)} credit`
            : formatMoney(a.balance)}
        </p>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-muted">
        <span>
          Opened {formatDate(a.openingDate)} with{' '}
          {credit
            ? `${formatMoney(Math.abs(a.openingBalance))} owed`
            : formatMoney(a.openingBalance)}
        </span>
        {a.archived ? <Badge tone="outline">Archived</Badge> : null}
        {a.isDemo ? <Badge tone="warning">Demo</Badge> : null}
      </div>
    </Card>
  );
}

function AccountForm({ account, onDone }: { account: Account | null; onDone: () => void }) {
  const api = useApi();
  const qc = useQueryClient();
  const today = useToday();
  const [name, setName] = useState(account?.name ?? '');
  const [type, setType] = useState<AccountType>(account?.type ?? 'bank');
  const credit = type === 'credit';
  const [opening, setOpening] = useState(
    account ? moneyToInput(credit ? Math.abs(account.openingBalance) : account.openingBalance) : '',
  );
  const [openingDate, setOpeningDate] = useState(account?.openingDate ?? today);
  const [errors, setErrors] = useState<{ name?: string; opening?: string }>({});

  const save = useMutation({
    mutationFn: (body: { name: string; openingBalance: number; openingDate: string }) =>
      account
        ? api.accounts.update(account.id, body)
        : api.accounts.create({ ...body, type, currency: 'PHP' }),
    onSuccess: (a) => {
      toast.success(account ? 'Account updated' : `${a.name} added`);
      onDone();
    },
    onSettled: () => invalidateFinancial(qc),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (!name.trim()) next.name = 'Give the account a name';
    // Credit: the user enters what they owe (positive); we store it as a negative balance.
    const parsed = opening.trim()
      ? readMoney(opening, { allowNegative: !credit, allowZero: true })
      : ({ ok: true, value: 0 } as const);
    if (!parsed.ok) next.opening = parsed.error;
    setErrors(next);
    if (!parsed.ok || Object.keys(next).length) return;
    save.mutate({
      name: name.trim(),
      openingBalance: credit ? -parsed.value : parsed.value,
      openingDate,
    });
  }

  return (
    <DialogContent
      title={account ? `Edit ${account.name}` : 'Add account'}
      description="Use the balance on the opening date; later transactions adjust it automatically."
    >
      <form onSubmit={submit} noValidate>
        <DialogBody>
          <Field label="Name" htmlFor="acc-name" error={errors.name}>
            <Input
              id="acc-name"
              autoFocus
              maxLength={120}
              value={name}
              placeholder="e.g. BPI Savings, GCash, Wallet"
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field
            label="Type"
            htmlFor="acc-type"
            hint={account ? 'The type cannot be changed after creation.' : undefined}
          >
            <NativeSelect
              id="acc-type"
              value={type}
              disabled={!!account}
              onChange={(e) => setType(e.target.value as AccountType)}
            >
              {ACCOUNT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ACCOUNT_TYPE_LABEL[t]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={credit ? 'Amount owed' : 'Opening balance'}
              htmlFor="acc-opening"
              error={errors.opening}
              hint={credit ? 'What you owe on the card as of the opening date.' : undefined}
            >
              <MoneyInput
                id="acc-opening"
                value={opening}
                allowNegative={!credit}
                onChange={(e) => setOpening(e.target.value)}
              />
            </Field>
            <Field label="Opening date" htmlFor="acc-date">
              <DateInput
                id="acc-date"
                value={openingDate}
                max={today}
                onChange={(e) => setOpeningDate(e.target.value)}
              />
            </Field>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : account ? 'Save changes' : 'Add account'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
