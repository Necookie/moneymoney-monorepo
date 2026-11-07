import type { Centavos, IsoDate } from '@mm/types';
import { buildForecast, type ForecastInput, type ForecastResult } from './forecast.js';
import { allocate } from './money.js';
import { applyScenario, SCENARIO_PURCHASE_ID } from './scenarios.js';

export interface AffordabilityInput {
  /** Baseline forecast inputs (actual balance, scheduled events, budgets, buffer). */
  forecast: ForecastInput;
  purchase: {
    name?: string;
    amount: Centavos;
    date: IsoDate;
    accountId?: string | null;
    categoryId?: string | null;
    /** Monthly installments (>1) instead of full payment. */
    installments?: number | null;
  };
  /** Current balance of the paying account (for "affordable today"). Defaults to the starting net position. */
  paymentAccountBalance?: Centavos | null;
  /** Money set aside for the emergency fund that should not be spent. */
  emergencyFundReserved?: Centavos;
}

export type AffordabilityVerdict =
  | 'comfortable'
  | 'tight'
  | 'compromises_emergency_fund'
  | 'creates_shortfall'
  | 'not_affordable_today';

export interface AffectedObligation {
  date: IsoDate;
  name: string;
  amount: Centavos;
  /** Projected balance right after this obligation, with the purchase. */
  balanceAfter: Centavos;
}

export interface AffordabilityResult {
  verdict: AffordabilityVerdict;
  /** You have enough in the paying account right now to pay the first payment. */
  affordableToday: boolean;
  /** Even with only confirmed income, the balance never drops below the safety buffer. */
  affordableWithoutCompromise: boolean;
  firstPayment: Centavos;
  /** Expected-mode projected balance at the end of the purchase date, after paying. */
  balanceAfterPurchase: Centavos;
  lowest: { balance: Centavos; date: IsoDate };
  baselineLowest: { balance: Centavos; date: IsoDate };
  conservativeLowest: { balance: Centavos; date: IsoDate };
  safetyBuffer: Centavos;
  /** Lowest balance minus the safety buffer (negative = buffer breached). */
  bufferHeadroom: Centavos;
  emergencyFund: { reserved: Centavos; compromised: boolean; shortfall: Centavos };
  firstShortfallDate: IsoDate | null;
  affectedObligations: AffectedObligation[];
  reasons: string[];
  withPurchase: ForecastResult;
  baseline: ForecastResult;
}

/** Simulate a purchase against the forecast. Never mutates or persists anything. */
export function assessAffordability(input: AffordabilityInput): AffordabilityResult {
  const { purchase } = input;
  const scenario = {
    type: 'purchase_added' as const,
    name: purchase.name ?? 'Purchase',
    amount: purchase.amount,
    date: purchase.date,
    accountId: purchase.accountId ?? null,
    categoryId: purchase.categoryId ?? null,
    installments: purchase.installments ?? null,
  };
  const baseInput: ForecastInput = { ...input.forecast, mode: 'expected' };
  const baseline = buildForecast(baseInput);
  const withPurchase = buildForecast(applyScenario(baseInput, scenario));
  const conservative = buildForecast(
    applyScenario({ ...input.forecast, mode: 'conservative' }, scenario),
  );

  const safetyBuffer = input.forecast.safetyBuffer ?? 0;
  const reserved = input.emergencyFundReserved ?? 0;
  const installments =
    purchase.installments && purchase.installments > 1 ? purchase.installments : 1;
  const firstPayment = allocate(purchase.amount, installments)[0] ?? purchase.amount;
  const payingBalance = input.paymentAccountBalance ?? input.forecast.startingBalance;
  const affordableToday = payingBalance >= firstPayment;

  const purchasePoint = withPurchase.points.find((p) => p.date === purchase.date);
  const balanceAfterPurchase = purchasePoint?.balance ?? withPurchase.endingBalance;

  const lowest = withPurchase.lowest;
  const bufferHeadroom = lowest.balance - safetyBuffer;
  const affordableWithoutCompromise =
    conservative.lowest.balance >= safetyBuffer && lowest.balance >= safetyBuffer;
  const emergencyShortfall = Math.max(0, reserved + safetyBuffer - lowest.balance);
  const emergencyCompromised = reserved > 0 && lowest.balance < reserved + safetyBuffer;

  // Obligations on/after the purchase that would leave the balance under the buffer.
  const affectedObligations: AffectedObligation[] = [];
  for (const point of withPurchase.points) {
    if (point.date < purchase.date) continue;
    if (point.balance >= safetyBuffer) continue;
    for (const item of point.items) {
      if (item.direction !== 'outflow' || item.eventId === SCENARIO_PURCHASE_ID) continue;
      affectedObligations.push({
        date: point.date,
        name: item.name,
        amount: item.amount,
        balanceAfter: point.balance,
      });
    }
    if (affectedObligations.length >= 10) break;
  }

  const reasons: string[] = [];
  let verdict: AffordabilityVerdict;
  if (!affordableToday) {
    verdict = 'not_affordable_today';
    reasons.push('The paying account does not currently hold enough for the first payment.');
  } else if (withPurchase.firstShortfallDate) {
    verdict = 'creates_shortfall';
    reasons.push(`Your projected balance goes negative on ${withPurchase.firstShortfallDate}.`);
  } else if (reserved > 0 && lowest.balance < reserved + safetyBuffer) {
    verdict = 'compromises_emergency_fund';
    reasons.push('Your balance would dip into money reserved for your emergency fund.');
  } else if (!affordableWithoutCompromise) {
    verdict = 'tight';
    reasons.push(
      lowest.balance < safetyBuffer
        ? `Your balance falls below your safety buffer on ${withPurchase.firstBelowBufferDate}.`
        : 'It only works if less-certain income arrives; with confirmed income alone the buffer is breached.',
    );
  } else {
    verdict = 'comfortable';
    reasons.push(
      'Upcoming obligations stay covered and your safety buffer stays intact, even on confirmed income only.',
    );
  }
  if (affordableToday && verdict !== 'comfortable' && !withPurchase.firstShortfallDate) {
    reasons.push(
      'You can pay for it today, but it would squeeze future obligations — consider postponing or installments.',
    );
  }

  return {
    verdict,
    affordableToday,
    affordableWithoutCompromise,
    firstPayment,
    balanceAfterPurchase,
    lowest,
    baselineLowest: baseline.lowest,
    conservativeLowest: conservative.lowest,
    safetyBuffer,
    bufferHeadroom,
    emergencyFund: {
      reserved,
      compromised: emergencyCompromised,
      shortfall: reserved > 0 ? emergencyShortfall : 0,
    },
    firstShortfallDate: withPurchase.firstShortfallDate,
    affectedObligations,
    reasons,
    withPurchase,
    baseline,
  };
}
