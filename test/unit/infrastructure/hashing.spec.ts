import { describe, expect, it } from 'vitest';
import {
  hashSecret,
  sha256Base64Url,
  sha256Hex,
  timingSafeEqualString,
  verifySecret,
} from '../../../src/infrastructure/security/hashing';

describe('hashing utilities', () => {
  it('hashes with sha256 hex', () => {
    const value = 'test-value';
    expect(sha256Hex(value)).toMatch(/^[a-f0-9]{64}$/);
    expect(sha256Hex(value)).toBe(sha256Hex(value));
  });

  it('hashes with sha256 base64url', () => {
    expect(sha256Base64Url('verifier')).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('compares strings in constant time semantics', () => {
    expect(timingSafeEqualString('abc', 'abc')).toBe(true);
    expect(timingSafeEqualString('abc', 'abd')).toBe(false);
    expect(timingSafeEqualString('abc', 'abcd')).toBe(false);
  });

  it('hashes and verifies scrypt secrets', async () => {
    const stored = await hashSecret('client-secret');
    expect(await verifySecret('client-secret', stored)).toBe(true);
    expect(await verifySecret('wrong-secret', stored)).toBe(false);
  });

  it('hashes and verifies sha256 secrets', async () => {
    const stored = await hashSecret('legacy-secret', { algorithm: 'sha256' });
    expect(await verifySecret('legacy-secret', stored)).toBe(true);
    expect(await verifySecret('wrong-secret', stored)).toBe(false);
  });
});
