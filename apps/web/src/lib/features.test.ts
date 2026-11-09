import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveFeatures } from './features.ts';

describe('resolveFeatures', () => {
  it('treats a missing features object as everything enabled', () => {
    const all = resolveFeatures(undefined);
    assert.equal(all.calendar, true);
    assert.equal(all.accounts, true);
    assert.deepEqual(resolveFeatures(null), all);
  });
  it('keeps explicit toggles and fills missing keys with defaults', () => {
    const f = resolveFeatures({ budgets: false });
    assert.equal(f.budgets, false);
    assert.equal(f.goals, true);
    assert.equal(f.afford, true);
  });
});
