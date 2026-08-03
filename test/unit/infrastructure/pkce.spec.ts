import { describe, expect, it } from 'vitest';
import { sha256Base64Url } from '../../../src/infrastructure/security/hashing';
import { verifyS256 } from '../../../src/infrastructure/identity/pkce';

describe('PKCE S256 verification', () => {
  it('accepts valid code verifier and challenge pair', () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = sha256Base64Url(verifier);
    expect(verifyS256(verifier, challenge)).toBe(true);
  });

  it('rejects invalid verifier', () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = sha256Base64Url(verifier);
    expect(verifyS256(`${verifier}x`, challenge)).toBe(false);
  });

  it('rejects empty values', () => {
    expect(verifyS256('', 'challenge')).toBe(false);
    expect(verifyS256('verifier', '')).toBe(false);
  });
});
