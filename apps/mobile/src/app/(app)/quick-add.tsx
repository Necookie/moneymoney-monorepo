import type { TransactionType } from '@mm/types';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Keypad } from '@/components/Keypad';
import { AccountChips, CategoryChips, DateField } from '@/components/pickers';
import { Button, Field, IconButton, Label, Row, Segmented, Text } from '@/components/ui';
import { useLocalAccounts, useLocalCategories } from '@/hooks/useLocalData';
import { centavosToInput, formatAmountInput } from '@/lib/amountInput';
import { formatMoney, today, tryParseMoney } from '@/lib/format';
import { addTransaction, editTransaction, getSyncRuntime } from '@/lib/sync/runtime';

const LAST_ACCOUNT = 'lastAccountId';

/**
 * Fast entry: keypad first, works fully offline. Saving writes to SQLite and queues the change
 * for sync — the screen closes immediately; the row shows "Pending" until the server confirms.
 */
export default function QuickAddScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = !!id;
  const accounts = useLocalAccounts();
  const categories = useLocalCategories();

  const [type, setType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState<string | null>(null);
  const [counterAccountId, setCounterAccountId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [date, setDate] = useState(today());
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [showNote, setShowNote] = useState(false);
  // Not editable here, but kept so saving an edit doesn't wipe tags set on the web.
  const [tags, setTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(!editing);

  // Load the row being edited, or default to the last-used account.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { storage } = await getSyncRuntime();
      if (id) {
        const tx = await storage.getTransaction(id);
        if (cancelled) return;
        if (!tx) {
          Alert.alert('Not found', 'This transaction is no longer on this device.');
          router.back();
          return;
        }
        setType(tx.type);
        setAmount(centavosToInput(tx.amount));
        setAccountId(tx.accountId);
        setCounterAccountId(tx.counterAccountId);
        setCategoryId(tx.categoryId);
        setDate(tx.occurredOn);
        setDescription(tx.description);
        setNotes(tx.notes ?? '');
        setShowNote(!!tx.notes);
        setTags(tx.tags);
        setLoaded(true);
      } else {
        const last = await storage.getMeta(LAST_ACCOUNT);
        if (!cancelled && last) setAccountId((cur) => cur ?? last);
      }
    })().catch(() => setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [id]);

  const accountList = useMemo(() => accounts.data?.accounts ?? [], [accounts.data]);
  useEffect(() => {
    // Fall back to the first open account if none is chosen / the remembered one is gone or was
    // archived (archived accounts aren't offered as chips, so it would be an invisible choice).
    // An edit keeps the row's own account even if archived.
    if (!loaded || !accountList.length) return;
    const usable = (a: (typeof accountList)[number]) =>
      a.id === accountId && (editing || !a.archived);
    if (!accountId || !accountList.some(usable)) {
      setAccountId(accountList.find((a) => !a.archived)?.id ?? null);
    }
  }, [accountList, accountId, loaded, editing]);

  const centavos = tryParseMoney(amount);
  const typeOptions = useMemo(() => {
    const base: { value: TransactionType; label: string }[] = [
      { value: 'expense', label: 'Expense' },
      { value: 'income', label: 'Income' },
      { value: 'transfer', label: 'Transfer' },
    ];
    if (type === 'refund') base.push({ value: 'refund', label: 'Refund' });
    return base;
  }, [type]);

  const save = async () => {
    setError(null);
    if (!centavos || centavos <= 0) return setError('Enter an amount greater than zero.');
    if (!accountId) return setError('Choose an account.');
    if (type === 'transfer') {
      if (!counterAccountId) return setError('Choose where the money goes.');
      if (counterAccountId === accountId) return setError('Pick two different accounts.');
    }
    const fields = {
      type,
      amount: centavos,
      accountId,
      counterAccountId: type === 'transfer' ? counterAccountId : null,
      categoryId: type === 'transfer' ? null : categoryId,
      occurredOn: date,
      description: description.trim(),
      notes: notes.trim() ? notes.trim() : null,
      tags,
    };
    setSaving(true);
    try {
      if (id) await editTransaction(id, fields);
      else await addTransaction(fields);
      const { storage } = await getSyncRuntime();
      await storage.setMeta(LAST_ACCOUNT, accountId);
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
      setSaving(false);
    }
  };

  const categoryKind = type === 'income' ? 'income' : 'expense';

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-canvas">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Row className="justify-between px-2 pt-1">
          <IconButton icon="x" label="Close" onPress={() => router.back()} />
          <Text weight="semibold" className="text-lg">
            {editing ? 'Edit transaction' : 'Quick add'}
          </Text>
          <View className="w-11" />
        </Row>

        <View className="items-center px-4 pb-2 pt-1">
          <Text
            weight="bold"
            tabular
            className={`text-display ${centavos ? 'text-ink' : 'text-subtle'}`}
            numberOfLines={1}
            accessibilityLabel={`Amount ${centavos ? formatMoney(centavos) : 'empty'}`}
          >
            {formatAmountInput(amount)}
          </Text>
        </View>

        <View className="px-4 pb-2">
          <Segmented
            options={typeOptions}
            value={type}
            onChange={(v) => {
              setType(v);
              setCategoryId(null);
            }}
          />
        </View>

        <ScrollView
          className="flex-1"
          contentContainerClassName="gap-4 px-4 pb-4"
          keyboardShouldPersistTaps="handled"
        >
          <View className="gap-1.5">
            <Label>{type === 'transfer' ? 'From' : 'Account'}</Label>
            <AccountChips accounts={accountList} value={accountId} onChange={setAccountId} />
          </View>
          {type === 'transfer' ? (
            <View className="gap-1.5">
              <Label>To</Label>
              <AccountChips
                accounts={accountList}
                value={counterAccountId}
                onChange={setCounterAccountId}
                exclude={accountId}
              />
              <Text className="text-xs text-muted">
                Transfers move money between your own accounts — never counted as income or
                spending.
              </Text>
            </View>
          ) : (
            <View className="gap-1.5">
              <Label>Category</Label>
              <CategoryChips
                categories={categories.data ?? []}
                kind={categoryKind}
                value={categoryId}
                onChange={setCategoryId}
              />
            </View>
          )}
          <DateField value={date} onChange={setDate} />
          <Field
            label="Description"
            value={description}
            onChangeText={setDescription}
            placeholder={type === 'expense' ? 'e.g. Groceries at SM' : 'Optional'}
            maxLength={200}
          />
          {showNote ? (
            <Field label="Note" value={notes} onChangeText={setNotes} multiline maxLength={2000} />
          ) : (
            <Button
              label="Add a note"
              variant="ghost"
              icon="pencil"
              onPress={() => setShowNote(true)}
            />
          )}
        </ScrollView>

        <View className="gap-2 border-t border-border bg-canvas px-3 pb-2 pt-2">
          {error ? <Text className="px-1 text-sm text-negative">{error}</Text> : null}
          <Keypad value={amount} onChange={setAmount} />
          <Button
            label={editing ? 'Save changes' : 'Save'}
            variant="primary"
            size="lg"
            loading={saving}
            disabled={!loaded || !centavos}
            onPress={save}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
