import { describe, expect, it } from 'vitest';
import { ScopeSet, SCOPES } from '../../../src/domain/value-objects';

describe('ScopeSet', () => {
  it('parses space-delimited scopes', () => {
    const scopes = ScopeSet.fromString('accounts:read  payments:write');
    expect(scopes.toArray()).toEqual(['accounts:read', 'payments:write']);
  });

  it('rejects invalid scope formats', () => {
    expect(() => ScopeSet.fromString('INVALID SCOPE')).toThrow(/Invalid scope format/);
  });

  it('checks containment', () => {
    const scopes = ScopeSet.fromString('accounts:read payments:write');
    expect(scopes.contains(SCOPES.ACCOUNTS_READ)).toBe(true);
    expect(scopes.contains(SCOPES.PAYMENTS_READ)).toBe(false);
    expect(scopes.containsAll(ScopeSet.fromString('accounts:read'))).toBe(true);
    expect(scopes.containsAll(ScopeSet.fromString('accounts:read payments:read'))).toBe(false);
  });

  it('reduces to allowed scopes', () => {
    const requested = ScopeSet.fromString('accounts:read payments:write openid');
    const allowed = ScopeSet.fromString('accounts:read openid');
    expect(requested.reduceTo(allowed).asString()).toBe('accounts:read openid');
  });

  it('returns stable string representation', () => {
    expect(ScopeSet.fromIterable(['payments:write', 'accounts:read']).asString()).toBe(
      'accounts:read payments:write',
    );
  });
});
