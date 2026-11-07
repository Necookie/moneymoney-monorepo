'use client';

import type { Transaction, TransactionPage } from '@mm/api-client';
import type { TransactionType } from '@mm/types';
import { addDays, endOfMonth, formatDate, formatMoney, startOfMonth } from '@mm/finance-engine';
import { useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DateInput } from '@/components/form-controls';
import { Icon } from '@/components/icons/icon';
import { EmptyState, ErrorState, PageHeader, SkeletonRows } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Field } from '@/components/ui/field';
import { Input, NativeSelect } from '@/components/ui/input';
import { Badge, Segmented } from '@/components/ui/misc';
import { useApi } from '@/lib/api';
import { shiftMonth, TRANSACTION_TYPE_LABEL } from '@/lib/format';
import {
  invalidateFinancial,
  qk,
  useLookups,
  useToday,
  useTransactions,
  type TransactionFilters,
} from '@/lib/queries';
import { cn } from '@/lib/utils';
import { CsvImportDialog, ExportButton } from './csv-dialogs';
import { useTransactionDialog } from './transaction-dialog';

type TypeFilter = 'all' | TransactionType;
type Preset = 'all' | 'this_month' | 'last_month' | 'last_30' | 'last_90' | 'this_year' | 'custom';

const PRESET_LABEL: Record<Preset, string> = {
  all: 'All time',
  this_month: 'This month',
  last_month: 'Last month',
  last_30: 'Last 30 days',
  last_90: 'Last 90 days',
  this_year: 'This year',
  custom: 'Custom range',
};

function presetRange(preset: Preset, today: string): { from?: string; to?: string } {
  switch (preset) {
    case 'this_month':
      return { from: startOfMonth(today), to: today };
    case 'last_month': {
      const key = shiftMonth(today.slice(0, 7), -1);
      return { from: `${key}-01`, to: endOfMonth(`${key}-01`) };
    }
    case 'last_30':
      return { from: addDays(today, -29), to: today };
    case 'last_90':
      return { from: addDays(today, -89), to: today };
    case 'this_year':
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
    default:
      return {};
  }
}

export function TransactionsPage() {
  const api = useApi();
  const qc = useQueryClient();
  const today = useToday();
  const params = useSearchParams();
  const lookups = useLookups();
  const { openCreate, openEdit } = useTransactionDialog();

  const [type, setType] = useState<TypeFilter>((params.get('type') as TypeFilter) ?? 'all');
  const [accountId, setAccountId] = useState(params.get('account') ?? '');
  const [categoryId, setCategoryId] = useState(params.get('category') ?? '');
  const [tag, setTag] = useState('');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [preset, setPreset] = useState<Preset>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [importOpen, setImportOpen] = useState(params.get('import') === '1');
  const [deleting, setDeleting] = useState<Transaction | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const range =
    preset === 'custom'
      ? { from: customFrom || undefined, to: customTo || undefined }
      : presetRange(preset, today);

  const baseFilters: TransactionFilters = useMemo(
    () => ({
      accountId: accountId || undefined,
      categoryId: categoryId || undefined,
      tag: tag.trim() || undefined,
      q: debounced || undefined,
      from: range.from,
      to: range.to,
    }),
    [accountId, categoryId, tag, debounced, range.from, range.to],
  );
  const filters: TransactionFilters = useMemo(
    () => ({ ...baseFilters, type: type === 'all' ? undefined : type }),
    [baseFilters, type],
  );

  const list = useTransactions(filters);

  // Exact chip counts come with the first page (computed server-side, ignoring the type filter).
  const countsByType = list.data?.pages[0]?.countsByType;
  const countLabel = (k: TypeFilter) => {
    if (!countsByType) return undefined;
    if (k === 'all') return Object.values(countsByType).reduce((a, b) => a + b, 0);
    return countsByType[k];
  };

  const remove = useMutation({
    mutationFn: (id: string) => api.transactions.remove(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: qk.transactions });
      const snapshot = qc.getQueriesData<InfiniteData<TransactionPage>>({
        queryKey: ['transactions', 'list'],
      });
      qc.setQueriesData<InfiniteData<TransactionPage>>(
        { queryKey: ['transactions', 'list'] },
        (data) =>
          data && {
            ...data,
            pages: data.pages.map((p) => ({ ...p, items: p.items.filter((t) => t.id !== id) })),
          },
      );
      return { snapshot };
    },
    onError: (_e, _id, ctx) => ctx?.snapshot.forEach(([key, data]) => qc.setQueryData(key, data)),
    onSuccess: () => toast.success('Transaction deleted'),
    onSettled: () => invalidateFinancial(qc),
  });

  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const totals = list.data?.pages[0]?.totals;
  const hasFilters =
    type !== 'all' || !!accountId || !!categoryId || !!tag || !!debounced || preset !== 'all';

  function clearFilters() {
    setType('all');
    setAccountId('');
    setCategoryId('');
    setTag('');
    setSearch('');
    setPreset('all');
    setCustomFrom('');
    setCustomTo('');
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Transactions"
        description="Every recorded movement of money. Transfers between your own accounts are never counted as income or spending."
        actions={
          <>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Icon name="upload" size={16} />
              Import CSV
            </Button>
            <ExportButton filters={filters} />
            <Button variant="primary" onClick={() => openCreate()}>
              <Icon name="plus" size={16} />
              Add transaction
            </Button>
          </>
        }
      />

      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,1fr))]">
          <div className="relative">
            <Icon
              name="search"
              size={16}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted"
            />
            <Input
              type="search"
              aria-label="Search description and notes"
              placeholder="Search description or notes"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <NativeSelect
            aria-label="Account"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            <option value="">All accounts</option>
            {lookups.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect
            aria-label="Category"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">All categories</option>
            {lookups.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.kind})
              </option>
            ))}
          </NativeSelect>
          <NativeSelect
            aria-label="Date range"
            value={preset}
            onChange={(e) => setPreset(e.target.value as Preset)}
          >
            {(Object.keys(PRESET_LABEL) as Preset[]).map((p) => (
              <option key={p} value={p}>
                {PRESET_LABEL[p]}
              </option>
            ))}
          </NativeSelect>
          <Input
            aria-label="Tag"
            placeholder="Tag"
            value={tag}
            onChange={(e) => setTag(e.target.value.replace(/^#/, ''))}
          />
        </div>
        {preset === 'custom' ? (
          <div className="mt-3 grid max-w-md grid-cols-2 gap-3">
            <Field label="From" htmlFor="tx-from">
              <DateInput
                id="tx-from"
                value={customFrom}
                max={customTo || undefined}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
            </Field>
            <Field label="To" htmlFor="tx-to">
              <DateInput
                id="tx-to"
                value={customTo}
                min={customFrom || undefined}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </Field>
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <Segmented
            label="Transaction type"
            size="sm"
            value={type}
            onChange={setType}
            options={[
              { value: 'all', label: 'All', count: countLabel('all') },
              { value: 'expense', label: 'Expenses', count: countLabel('expense') },
              { value: 'income', label: 'Income', count: countLabel('income') },
              { value: 'transfer', label: 'Transfers', count: countLabel('transfer') },
              { value: 'refund', label: 'Refunds', count: countLabel('refund') },
              { value: 'adjustment', label: 'Adjustments', count: countLabel('adjustment') },
            ]}
          />
          {hasFilters ? (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <Icon name="close" size={14} />
              Clear filters
            </Button>
          ) : null}
        </div>
      </Card>

      {list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : list.isPending ? (
        <Card className="p-5">
          <SkeletonRows rows={8} />
        </Card>
      ) : items.length === 0 ? (
        hasFilters ? (
          <EmptyState
            icon="search"
            title="No transactions match these filters"
            description="Try a wider date range or clear the filters."
            action={
              <Button variant="outline" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon="transactions"
            title="No transactions yet"
            description="Record what you spend and earn, or import a CSV from your bank."
            action={
              <>
                <Button variant="primary" size="sm" onClick={() => openCreate()}>
                  Add transaction
                </Button>
                <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                  Import CSV
                </Button>
              </>
            }
          />
        )
      ) : (
        <Card className={cn('overflow-hidden', list.isPlaceholderData && 'opacity-60')}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[14px]">
              <thead className="sticky top-0 z-10 bg-card">
                <tr className="border-b text-left">
                  <th scope="col" className="section-label px-5 py-3 !font-semibold">
                    Date
                  </th>
                  <th scope="col" className="section-label px-3 py-3 !font-semibold">
                    Description
                  </th>
                  <th scope="col" className="section-label px-3 py-3 !font-semibold">
                    Account
                  </th>
                  <th scope="col" className="section-label px-3 py-3 text-right !font-semibold">
                    Amount
                  </th>
                  <th scope="col" className="w-12 px-3 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((t) => (
                  <TransactionRow
                    key={t.id}
                    tx={t}
                    lookups={lookups}
                    onEdit={() => openEdit(t)}
                    onDelete={() => setDeleting(t)}
                  />
                ))}
              </tbody>
              {totals ? (
                <tfoot>
                  <tr className="border-t bg-canvas/60 text-[13px]">
                    <td colSpan={5} className="px-5 py-3">
                      <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1">
                        <span className="text-muted">
                          Totals for these filters (transfers excluded)
                        </span>
                        <span>
                          <span className="text-muted">Income </span>
                          <span className="tabular font-medium text-positive">
                            {formatMoney(totals.income)}
                          </span>
                        </span>
                        <span>
                          <span className="text-muted">Spending </span>
                          <span className="tabular font-medium">
                            {formatMoney(totals.expenses - totals.refunds)}
                          </span>
                        </span>
                        <span>
                          <span className="text-muted">Net </span>
                          <span
                            className={cn(
                              'tabular font-semibold',
                              totals.net < 0 ? 'text-negative' : 'text-ink',
                            )}
                          >
                            {formatMoney(totals.net, { signed: true })}
                          </span>
                        </span>
                      </div>
                    </td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
          <div className="flex items-center justify-between gap-3 border-t px-5 py-3 text-[13px] text-muted">
            <span>
              Showing {items.length} transaction{items.length === 1 ? '' : 's'}
            </span>
            {list.hasNextPage ? (
              <Button
                variant="outline"
                size="sm"
                disabled={list.isFetchingNextPage}
                onClick={() => void list.fetchNextPage()}
              >
                {list.isFetchingNextPage ? 'Loading…' : 'Load more'}
              </Button>
            ) : (
              <span>End of list</span>
            )}
          </div>
        </Card>
      )}

      <CsvImportDialog open={importOpen} onOpenChange={setImportOpen} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this transaction?"
        description={
          deleting
            ? `${TRANSACTION_TYPE_LABEL[deleting.type]} of ${formatMoney(deleting.amount)} on ${formatDate(deleting.occurredOn)}. Balances, budgets and forecasts will be recalculated.`
            : ''
        }
        confirmLabel="Delete"
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

function signedDisplay(t: Transaction): { text: string; className: string } {
  switch (t.type) {
    case 'income':
      return { text: `+${formatMoney(t.amount)}`, className: 'text-positive' };
    case 'refund':
      return { text: `+${formatMoney(t.amount)}`, className: 'text-positive' };
    case 'expense':
      return { text: `−${formatMoney(t.amount)}`, className: 'text-ink' };
    case 'transfer':
      // Neutral: moving money between own accounts is neither income nor spending.
      return { text: formatMoney(t.amount), className: 'text-muted' };
    case 'adjustment':
      return {
        text: formatMoney(t.amount, { signed: true }),
        className: t.amount < 0 ? 'text-negative' : 'text-ink',
      };
  }
}

function TransactionRow({
  tx,
  lookups,
  onEdit,
  onDelete,
}: {
  tx: Transaction;
  lookups: ReturnType<typeof useLookups>;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const amount = signedDisplay(tx);
  const title =
    tx.description ||
    (tx.type === 'transfer'
      ? 'Transfer'
      : tx.categoryId
        ? lookups.categoryName(tx.categoryId)
        : TRANSACTION_TYPE_LABEL[tx.type]);
  return (
    <tr className="group hover:bg-canvas/50">
      <td className="tabular px-5 py-3 align-top whitespace-nowrap text-ink-soft">
        {formatDate(tx.occurredOn)}
      </td>
      <td className="max-w-[340px] px-3 py-3 align-top">
        <button
          type="button"
          onClick={onEdit}
          className="block max-w-full cursor-pointer truncate text-left font-medium hover:underline"
        >
          {title}
        </button>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
          <span>{TRANSACTION_TYPE_LABEL[tx.type]}</span>
          {tx.categoryId && tx.type !== 'transfer' ? (
            <>
              <span>·</span>
              <span>{lookups.categoryName(tx.categoryId)}</span>
            </>
          ) : null}
          {tx.scheduledEventId ? (
            <Badge tone="outline" className="py-0">
              From calendar
            </Badge>
          ) : null}
          {tx.isDemo ? (
            <Badge tone="warning" className="py-0">
              Demo
            </Badge>
          ) : null}
          {tx.tags.map((t) => (
            <Badge key={t} tone="neutral" className="py-0">
              #{t}
            </Badge>
          ))}
        </div>
      </td>
      <td className="px-3 py-3 align-top text-ink-soft">
        {tx.type === 'transfer' ? (
          <span className="inline-flex flex-wrap items-center gap-1">
            {lookups.accountName(tx.accountId)}
            <Icon name="arrowRight" size={12} className="text-muted" />
            {lookups.accountName(tx.counterAccountId)}
          </span>
        ) : (
          lookups.accountName(tx.accountId)
        )}
      </td>
      <td
        className={cn(
          'tabular px-3 py-3 text-right align-top font-medium whitespace-nowrap',
          amount.className,
        )}
      >
        {amount.text}
      </td>
      <td className="px-3 py-2 text-right align-top">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${title}`}>
              <Icon name="more" size={16} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={onEdit}>
              <Icon name="edit" size={14} />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem destructive onSelect={onDelete}>
              <Icon name="trash" size={14} />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
}
