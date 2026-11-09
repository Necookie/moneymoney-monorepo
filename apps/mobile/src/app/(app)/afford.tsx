import type { AffordabilityResponse } from '@mm/api-client';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { Icon, type IconName } from '@/components/Icon';
import { AccountChips, DateField } from '@/components/pickers';
import { Screen } from '@/components/Screen';
import { FeatureGate } from '@/components/FeatureDisabled';
import { Button, Card, Divider, Field, Label, Money, Row, Text } from '@/components/ui';
import { useLocalAccounts } from '@/hooks/useLocalData';
import { errorMessage, getApi } from '@/lib/api';
import { formatDate, formatMoney, today, tryParseMoney } from '@/lib/format';
import { colors } from '@/lib/theme';

const VERDICT: Record<
  AffordabilityResponse['verdict'],
  { title: string; tone: 'positive' | 'warning' | 'negative'; icon: IconName }
> = {
  comfortable: { title: 'Yes — comfortably', tone: 'positive', icon: 'circle-check' },
  tight: { title: 'Yes, but it gets tight', tone: 'warning', icon: 'triangle-alert' },
  compromises_emergency_fund: {
    title: 'Only by dipping into your emergency fund',
    tone: 'warning',
    icon: 'triangle-alert',
  },
  creates_shortfall: {
    title: 'Not without missing obligations',
    tone: 'negative',
    icon: 'circle-alert',
  },
  not_affordable_today: { title: 'Not affordable today', tone: 'negative', icon: 'circle-alert' },
};

const TONE = {
  positive: { box: 'bg-positive-soft', color: colors.positive },
  warning: { box: 'bg-warning-soft', color: colors.warning },
  negative: { box: 'bg-negative-soft', color: colors.negative },
};

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <Row className="min-h-10 gap-2">
      <Icon
        name={ok ? 'circle-check' : 'circle-alert'}
        size={18}
        color={ok ? colors.positive : colors.negative}
      />
      <Text className="flex-1">{label}</Text>
    </Row>
  );
}

/** Review-before-commit verdict: affordable today vs. without compromising obligations. */
export default function AffordScreen() {
  return (
    <FeatureGate
      feature="afford"
      title="Can I afford this?"
      featureName="Can I afford this?"
      description="Enable this feature in Settings to test purchases against upcoming obligations."
    >
      <AffordContent />
    </FeatureGate>
  );
}

function AffordContent() {
  const accounts = useLocalAccounts();
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [accountId, setAccountId] = useState<string | null>(null);
  const [installments, setInstallments] = useState('');

  const check = useMutation<AffordabilityResponse, Error>({
    mutationFn: () => {
      const value = tryParseMoney(amount);
      if (!value || value <= 0) throw new Error('Enter the price.');
      const inst = installments ? Number(installments) : null;
      if (inst !== null && (!Number.isInteger(inst) || inst < 2 || inst > 120)) {
        throw new Error('Installments must be between 2 and 120.');
      }
      return getApi().forecast.affordability({
        name: name.trim() || undefined,
        amount: value,
        date,
        accountId,
        installments: inst,
      });
    },
  });
  const r = check.data;
  const v = r ? VERDICT[r.verdict] : null;

  return (
    <Screen title="Can I afford this?" back>
      <Card className="gap-3">
        <Field
          label="What is it?"
          value={name}
          onChangeText={setName}
          placeholder="e.g. New laptop"
          maxLength={120}
        />
        <Field
          label="Price (₱)"
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="0.00"
        />
        <DateField label="When" value={date} onChange={setDate} quick="future" />
        <View className="gap-1.5">
          <Label>Pay from (optional)</Label>
          <AccountChips
            accounts={accounts.data?.accounts ?? []}
            value={accountId}
            onChange={(id) => setAccountId(id === accountId ? null : id)}
          />
        </View>
        <Field
          label="Installments (optional)"
          value={installments}
          onChangeText={setInstallments}
          keyboardType="number-pad"
          placeholder="e.g. 12"
          maxLength={3}
        />
        <Button
          label="Check"
          variant="primary"
          size="lg"
          loading={check.isPending}
          onPress={() => check.mutate()}
        />
        {check.error ? (
          <Text className="text-sm text-negative">{errorMessage(check.error)}</Text>
        ) : null}
      </Card>

      {r && v ? (
        <Card className="gap-3">
          <View className={`flex-row items-center gap-3 rounded-input p-3 ${TONE[v.tone].box}`}>
            <Icon name={v.icon} size={24} color={TONE[v.tone].color} />
            <Text
              weight="semibold"
              className="flex-1 text-lg"
              style={{ color: TONE[v.tone].color }}
            >
              {v.title}
            </Text>
          </View>
          <Check ok={r.affordableToday} label="Affordable today from what you actually have" />
          <Check
            ok={r.affordableWithoutCompromise}
            label="Without compromising planned bills, your buffer or emergency fund"
          />
          <Divider />
          <Row className="justify-between">
            <Text className="text-sm text-muted">
              {installments ? 'First installment' : 'Cost'}
            </Text>
            <Money value={r.firstPayment} className="text-sm" />
          </Row>
          <Row className="justify-between">
            <Text className="text-sm text-muted">Balance right after</Text>
            <Money value={r.balanceAfterPurchase} tone="auto" className="text-sm" />
          </Row>
          <Row className="justify-between">
            <Text className="text-sm text-muted">Lowest point with it</Text>
            <Text
              tabular
              weight="semibold"
              className={`text-sm ${r.lowest.balance < 0 ? 'text-negative' : 'text-ink'}`}
            >
              {formatMoney(r.lowest.balance)} · {formatDate(r.lowest.date, false)}
            </Text>
          </Row>
          <Row className="justify-between">
            <Text className="text-sm text-muted">Lowest point without it</Text>
            <Text tabular className="text-sm">
              {formatMoney(r.baselineLowest.balance)}
            </Text>
          </Row>
          <Row className="justify-between">
            <Text className="text-sm text-muted">If income disappoints (cautious)</Text>
            <Text
              tabular
              className={`text-sm ${r.conservativeLowest.balance < 0 ? 'text-negative' : 'text-ink'}`}
            >
              {formatMoney(r.conservativeLowest.balance)}
            </Text>
          </Row>
          {r.emergencyFund.compromised ? (
            <Text className="text-sm text-warning">
              Uses {formatMoney(r.emergencyFund.shortfall)} of the{' '}
              {formatMoney(r.emergencyFund.reserved)} emergency fund.
            </Text>
          ) : null}
          {r.affectedObligations.length ? (
            <View className="gap-1">
              <Label>Obligations at risk</Label>
              {r.affectedObligations.map((o) => (
                <Row key={`${o.name}:${o.date}`} className="justify-between">
                  <Text className="flex-1 text-sm" numberOfLines={1}>
                    {formatDate(o.date, false)} · {o.name}
                  </Text>
                  <Text tabular className="text-sm text-negative">
                    {formatMoney(o.balanceAfter)} after
                  </Text>
                </Row>
              ))}
            </View>
          ) : null}
          {r.reasons.length ? (
            <View className="gap-1">
              <Label>Why</Label>
              {r.reasons.map((reason, i) => (
                <Text key={i} className="text-sm text-ink-soft">
                  • {reason}
                </Text>
              ))}
            </View>
          ) : null}
          <Text className="text-xs text-muted">
            Nothing was saved. Add it as a planned purchase in Plan if you decide to go ahead.
          </Text>
        </Card>
      ) : null}
    </Screen>
  );
}
