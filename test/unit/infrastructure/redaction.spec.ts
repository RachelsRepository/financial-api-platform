import { describe, expect, it } from 'vitest';
import { redactForLogging } from '../../../src/infrastructure/security/redaction';

describe('redactForLogging', () => {
  it('redacts sensitive keys and bearer tokens', () => {
    const input = {
      clientSecret: 'super-secret',
      authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig',
      nested: {
        refreshToken: 'refresh-value',
        safe: 'visible',
      },
      accountNumber: '12345678901234',
    };

    const redacted = redactForLogging(input);
    expect(redacted.clientSecret).toBe('[REDACTED]');
    expect(redacted.authorization).toBe('[REDACTED]');
    expect(redacted.nested.refreshToken).toBe('[REDACTED]');
    expect(redacted.nested.safe).toBe('visible');
    expect(redacted.accountNumber).toBe('[REDACTED]');
  });

  it('preserves non-sensitive primitives', () => {
    expect(redactForLogging(42)).toBe(42);
    expect(redactForLogging(true)).toBe(true);
    expect(redactForLogging(null)).toBe(null);
  });
});
