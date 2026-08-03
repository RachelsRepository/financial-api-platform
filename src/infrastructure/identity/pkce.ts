import { timingSafeEqualString, sha256Base64Url } from '@infrastructure/security/hashing';

export function verifyS256(codeVerifier: string, codeChallenge: string): boolean {
  if (!codeVerifier || !codeChallenge) {
    return false;
  }

  const computed = sha256Base64Url(codeVerifier);
  return timingSafeEqualString(computed, codeChallenge);
}
