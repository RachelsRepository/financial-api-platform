import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1 } as const;

function scryptAsync(password: string, salt: string, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, SCRYPT_OPTIONS, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(derivedKey);
    });
  });
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function sha256Base64Url(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('base64url');
}

export function timingSafeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');

  if (bufA.length !== bufB.length) {
    return false;
  }

  return timingSafeEqual(bufA, bufB);
}

export interface HashedSecret {
  readonly hash: string;
  readonly salt: string;
  readonly algorithm: 'scrypt' | 'sha256';
}

export async function hashSecret(
  secret: string,
  options: { algorithm?: 'scrypt' | 'sha256' } = {},
): Promise<HashedSecret> {
  const algorithm = options.algorithm ?? 'scrypt';

  if (algorithm === 'sha256') {
    const salt = randomBytes(16).toString('hex');
    const hash = sha256Hex(`${salt}:${secret}`);
    return { hash, salt, algorithm };
  }

  const salt = randomBytes(16).toString('hex');
  const derived = await scryptAsync(secret, salt, SCRYPT_KEY_LENGTH);
  return { hash: derived.toString('hex'), salt, algorithm: 'scrypt' };
}

export async function verifySecret(secret: string, stored: HashedSecret): Promise<boolean> {
  if (stored.algorithm === 'sha256') {
    const candidate = sha256Hex(`${stored.salt}:${secret}`);
    return timingSafeEqualString(candidate, stored.hash);
  }

  const derived = await scryptAsync(secret, stored.salt, SCRYPT_KEY_LENGTH);
  const candidate = derived.toString('hex');
  return timingSafeEqualString(candidate, stored.hash);
}
