'use client';

import type { Transaction, TransactionPage } from '@mm/api-client';
import type { TransactionType } from '@mm/types';
import { formatMoney } from '@mm/finance-engine';
import { useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import Link from 'next/link';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { toast } from 'sonner';
import { AccountSelect, CategorySelect, DateInput, MoneyInput } from '@/components/form-controls';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Segmented } from '@/components/ui/misc';
import { useApi } from '@/lib/api';
import { moneyToInput, parseTags, readMoney, TRANSACTION_TYPE_LABEL } from '@/lib/format';
import { invalidateFinancial, qk, useLookups, useToday } from '@/lib/queries';
import { newId } from '@/lib/utils';

interface DialogState {
  open: boolean;
  editing: Transaction | null;
  defaults?: Partial<Pick<Transaction, 'type' | 'accountId' | 'categoryId'>>;
}

interface TransactionDialogApi {
  openCreate: (defaults?: DialogState['defaults']) => void;
  openEdit: (tx: Transaction) => void;
}

const Ctx = createContext<TransactionDialogApi | null>(null);

export function useTransactionDialog(): TransactionDialogApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTransactionDialog must be used inside TransactionDialogProvider');
  return ctx;
}

/** Global "Add transaction" dialog, opened from the sidebar, the N shortcut and pages. */
export function TransactionDialogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DialogState>({ open: false, editing: null });
  const openCreate = useCallback(
    (defaults?: DialogState['defaults']) => setState({ open: true, editing: null, defaults }),
    [],
  );
  const openEdit = useCallback((tx: Transaction) => setState({ open: true, editing: tx }), []);
  const api = useMemo(() => ({ openCreate, openEdit }), [openCreate, openEdit]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <Dialog open={state.open} onOpenChange={(open) => setState((s) => ({ ...s, open }))}>
        {state.open ? (
          <TransactionForm
            key={state.editing?.id ?? 'new'}
            editing={state.editing}
            defaults={state.defaults}
            onDone={() => setState((s) => ({ ...s, open: false }))}
          />
        ) : null}
      </Dialog>
    </Ctx.Provider>
  );
}

const TYPE_OPTIONS: ReadonlyArray<{ value: TransactionType; label: string }> = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'refund', label: 'Refund' },
  { value: 'adjustment', label: 'Adjustment' },
];

const TYPE_HINT: Record<TransactionType, string> = {
  expense: 'Money you spent.',
  income: 'Money you received (salary, freelance, gifts…).',
  transfer: 'Moving money between your own accounts — never counted as income or spending.',
  refund: 'Money returned for an earlier expense; it reduces spending in its category.',
  adjustment:
    'Corrects an account balance to match reality. Use a negative amount to reduce the balance.',
};

type Errors = Partial<Record<'amount' | 'accountId' | 'counterAccountId' | 'occurredOn', string>>;

function TransactionForm({
  editing,
  defaults,
  onDone,
}: {
  editing: Transaction | null;
  defaults?: DialogState['defaults'];
  onDone: () => void;
}) {
  const api = useApi();
  const qc = useQueryClient();
  const today = useToday();
  const { accounts, categories } = useLookups();
  const activeAccounts = accounts.filter((a) => !a.archived);

  const [type, setType] = useState<TransactionType>(editing?.type ?? defaults?.type ?? 'expense');
  const [amount, setAmount] = useState(moneyToInput(editing?.amount));
  const [accountId, setAccountId] = useState(
    editing?.accountId ?? defaults?.accountId ?? activeAccounts[0]?.id ?? '',
  );
  const [counterAccountId, setCounterAccountId] = useState(editing?.counterAccountId ?? '');
  const [categoryId, setCategoryId] = useState(editing?.categoryId ?? defaults?.categoryId ?? '');
  const [occurredOn, setOccurredOn] = useState(editing?.occurredOn ?? today);
  const [description, setDescription] = useState(editing?.description ?? '');
  const [tags, setTags] = useState((editing?.tags ?? []).join(', '));
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [errors, setErrors] = useState<Errors>({});

  const categoryKind =
    type === 'income' ? 'income' : type === 'transfer' || type === 'adjustment' ? null : 'expense';

  const save = useMutation({
    mutationFn: async (body: Parameters<typeof api.transactions.create>[0]) => {
      if (editing) {
        const { id: _id, ...patch } = body;
        return api.transactions.update(editing.id, {
          ...patch,
          counterAccountId: body.type === 'transfer' ? body.counterAccountId : null,
          categoryId: body.categoryId ?? null,
          notes: body.notes ?? null,
        });
      }
      return api.transactions.create(body);
    },
    onMutate: async (body) => {
      if (!editing) return undefined;
      // Optimistic edit: patch the row in every cached transaction page.
      await qc.cancelQueries({ queryKey: qk.transactions });
      const snapshot = qc.getQueriesData<InfiniteData<TransactionPage>>({
        queryKey: ['transactions', 'list'],
      });
      qc.setQueriesData<InfiniteData<TransactionPage>>(
        { queryKey: ['transactions', 'list'] },
        (data) =>
          data && {
            ...data,
            pages: data.pages.map((p) => ({
              ...p,
              items: p.items.map((t) =>
                t.id === editing.id
                  ? {
                      ...t,
                      ...body,
                      id: t.id,
                      counterAccountId: body.counterAccountId ?? null,
                      categoryId: body.categoryId ?? null,
                      notes: body.notes ?? null,
                      tags: body.tags ?? t.tags,
                      description: body.description ?? t.description,
                    }
                  : t,
              ),
            })),
          },
      );
      return { snapshot };
    },
    onError: (_err, _body, ctx) => {
      ctx?.snapshot.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSuccess: (tx) => {
      toast.success(editing ? 'Transaction updated' : 'Transaction added', {
        description: `${TRANSACTION_TYPE_LABEL[tx.type]} · ${formatMoney(tx.amount)}`,
      });
      onDone();
    },
    onSettled: () => invalidateFinancial(qc),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const next: Errors = {};
    const parsed = readMoney(amount, { allowNegative: type === 'adjustment' });
    if (!parsed.ok) next.amount = parsed.error;
    if (!accountId) next.accountId = 'Choose an account';
    if (type === 'transfer') {
      if (!counterAccountId) next.counterAccountId = 'Choose the destination account';
      else if (counterAccountId === accountId)
        next.counterAccountId = 'Pick a different account than the source';
    }
    if (!occurredOn) next.occurredOn = 'Choose a date';
    setErrors(next);
    if (Object.keys(next).length > 0 || !parsed.ok) return;

    save.mutate({
      id: editing?.id ?? newId(),
      type,
      amount: parsed.value,
      accountId,
      counterAccountId: type === 'transfer' ? counterAccountId : null,
      categoryId: categoryKind && categoryId ? categoryId : null,
      occurredOn,
      description: description.trim(),
      notes: notes.trim() ? notes.trim() : null,
      tags: parseTags(tags),
    });
  }

  if (accounts.length > 0 && activeAccounts.length === 0 && !editing) {
    return (
      <DialogContent title="Add transaction">
        <DialogBody>
          <p className="text-sm text-muted">
            All accounts are archived. Unarchive or add an account first.
          </p>
        </DialogBody>
        <DialogFooter>
          <Button asChild variant="primary">
            <Link href="/accounts" onClick={onDone}>
              Go to accounts
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    );
  }

  if (accounts.length === 0) {
    return (
      <DialogContent title="Add transaction" description="Transactions belong to an account.">
        <DialogBody>
          <p className="text-sm text-muted">
            Add your first account (cash, bank, e-wallet, savings or credit card) before recording
            transactions.
          </p>
        </DialogBody>
        <DialogFooter>
          <Button asChild variant="primary">
            <Link href="/accounts?new=1" onClick={onDone}>
              Add an account
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    );
  }

  return (
    <DialogContent
      title={editing ? 'Edit transaction' : 'Add transaction'}
      description={TYPE_HINT[type]}
    >
      <form onSubmit={submit} noValidate>
        <DialogBody>
          <Segmented
            label="Transaction type"
            value={type}
            onChange={(t) => {
              setType(t);
              setCategoryId('');
              setErrors({});
            }}
            options={TYPE_OPTIONS}
            size="sm"
            className="self-start"
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Amount" htmlFor="tx-amount" error={errors.amount}>
              <MoneyInput
                id="tx-amount"
                autoFocus
                value={amount}
                allowNegative={type === 'adjustment'}
                aria-invalid={!!errors.amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>
            <Field label="Date" htmlFor="tx-date" error={errors.occurredOn}>
              <DateInput
                id="tx-date"
                value={occurredOn}
                max={today}
                onChange={(e) => setOccurredOn(e.target.value)}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={type === 'transfer' ? 'From account' : 'Account'}
              htmlFor="tx-account"
              error={errors.accountId}
            >
              <AccountSelect
                id="tx-account"
                accounts={accounts}
                value={accountId}
                onChange={setAccountId}
                placeholder="Choose account"
              />
            </Field>
            {type === 'transfer' ? (
              <Field label="To account" htmlFor="tx-counter" error={errors.counterAccountId}>
                <AccountSelect
                  id="tx-counter"
                  accounts={accounts.filter((a) => a.id !== accountId)}
                  value={counterAccountId}
                  onChange={setCounterAccountId}
                  placeholder="Choose destination"
                />
              </Field>
            ) : categoryKind ? (
              <Field label="Category" htmlFor="tx-category">
                <CategorySelect
                  id="tx-category"
                  categories={categories}
                  kind={categoryKind}
                  value={categoryId}
                  onChange={setCategoryId}
                />
              </Field>
            ) : null}
          </div>

          <Field label="Description" htmlFor="tx-desc" optional>
            <Input
              id="tx-desc"
              value={description}
              maxLength={200}
              placeholder={type === 'transfer' ? 'e.g. Move to savings' : 'e.g. Groceries at SM'}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>

          <Field
            label="Tags"
            htmlFor="tx-tags"
            optional
            hint="Separate with commas, e.g. trip, work"
          >
            <Input id="tx-tags" value={tags} onChange={(e) => setTags(e.target.value)} />
          </Field>

          <Field label="Notes" htmlFor="tx-notes" optional>
            <Textarea
              id="tx-notes"
              rows={2}
              maxLength={2000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : editing ? 'Save changes' : 'Add transaction'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
