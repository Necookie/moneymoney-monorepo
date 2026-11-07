import type { EngineEvent } from '../src/index.js';

/** Build a test event with sensible defaults. Amounts are centavos. */
export function ev(
  partial: Partial<EngineEvent> & Pick<EngineEvent, 'id' | 'amount' | 'startDate'>,
): EngineEvent {
  return {
    name: partial.id,
    direction: 'outflow',
    kind: 'expense',
    status: 'planned',
    confidence: 'confirmed',
    recurrence: { frequency: 'none' },
    ...partial,
  };
}

export const peso = (n: number) => n * 100;
