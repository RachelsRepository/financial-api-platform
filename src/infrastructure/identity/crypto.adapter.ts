import { Injectable } from '@nestjs/common';
import type { CryptoPort } from '@application/ports/crypto.port';
import { verifyS256 } from '@infrastructure/identity/pkce';
import {
  hashSecret,
  sha256Hex,
  timingSafeEqualString,
  verifySecret,
  type HashedSecret,
} from '@infrastructure/security/hashing';

function parseStoredSecret(stored: string): HashedSecret | null {
  const parts = stored.split(':');
  if (parts.length !== 3) {
    return null;
  }

  const [algorithm, salt, hash] = parts;
  if (algorithm !== 'scrypt' && algorithm !== 'sha256') {
    return null;
  }

  return {
    algorithm,
    salt: salt ?? '',
    hash: hash ?? '',
  };
}

function serializeSecret(stored: HashedSecret): string {
  return `${stored.algorithm}:${stored.salt}:${stored.hash}`;
}

@Injectable()
export class CryptoAdapter implements CryptoPort {
  hash(value: string): Promise<string> {
    return Promise.resolve(sha256Hex(value));
  }

  async compare(plain: string, hash: string): Promise<boolean> {
    const parsed = parseStoredSecret(hash);
    if (parsed !== null) {
      return verifySecret(plain, parsed);
    }

    const candidate = sha256Hex(plain);
    return timingSafeEqualString(candidate, hash);
  }

  verifyPkce(codeVerifier: string, codeChallenge: string, method: string): boolean {
    if (method === 'plain') {
      return timingSafeEqualString(codeVerifier, codeChallenge);
    }

    return verifyS256(codeVerifier, codeChallenge);
  }

  async hashClientSecret(secret: string): Promise<string> {
    const hashed = await hashSecret(secret);
    return serializeSecret(hashed);
  }
}
