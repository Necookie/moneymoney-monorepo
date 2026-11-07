import type { OccurrenceDto } from '@mm/api-client';
import { Chip } from './ui';

/** Confidence of planned income — uncertain income is never presented as cash. */
export function ConfidenceChip({ confidence }: { confidence: OccurrenceDto['confidence'] }) {
  const tone =
    confidence === 'confirmed' ? 'positive' : confidence === 'likely' ? 'warning' : 'muted';
  const label =
    confidence === 'confirmed' ? 'Confirmed' : confidence === 'likely' ? 'Likely' : 'Uncertain';
  return <Chip label={label} tone={tone} />;
}
