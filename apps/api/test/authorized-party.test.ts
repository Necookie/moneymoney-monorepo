import { describe, expect, it } from 'vitest';
import { isAuthorizedParty } from '../src/plugins/auth.js';

const allowed = ['https://moneymoney.necookie.dev'];

describe('authorized party (azp) rule', () => {
  it('accepts browser tokens from the allowed web origin', () => {
    expect(isAuthorizedParty('https://moneymoney.necookie.dev', allowed)).toBe(true);
  });

  it('rejects browser tokens minted for other origins', () => {
    expect(isAuthorizedParty('https://evil.example', allowed)).toBe(false);
    expect(isAuthorizedParty('https://moneymoney.necookie.dev.evil.example', allowed)).toBe(false);
  });

  it('accepts native-app tokens, which carry no azp claim', () => {
    expect(isAuthorizedParty(undefined, allowed)).toBe(true);
    expect(isAuthorizedParty(null, allowed)).toBe(true);
  });

  it('accepts any azp when no allow-list is configured (development)', () => {
    expect(isAuthorizedParty('http://localhost:3000', [])).toBe(true);
  });
});
