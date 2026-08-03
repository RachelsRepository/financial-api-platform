#!/usr/bin/env node
/**
 * Generate ES256 signing keys for local development / ephemeral CI OpenAPI bootstrap.
 * Never commit private JWKs. Prefer --write-env in CI so private material is not echoed.
 *
 * Usage:
 *   node scripts/generate-dev-keys.mjs [kid]
 *   node scripts/generate-dev-keys.mjs --write-env <path> [kid]
 *
 * Outputs JWT_ACTIVE_KID, JWT_PRIVATE_JWK, and JWT_PUBLIC_JWKS.
 */
import { generateKeyPair, exportJWK } from 'jose';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
let writeEnvPath = null;
const positional = [];

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--write-env') {
    writeEnvPath = args[i + 1];
    if (!writeEnvPath || writeEnvPath.startsWith('-')) {
      console.error('generate-dev-keys: --write-env requires a file path');
      process.exit(1);
    }
    i += 1;
    continue;
  }
  if (arg.startsWith('-')) {
    console.error(`generate-dev-keys: unknown option ${arg}`);
    process.exit(1);
  }
  positional.push(arg);
}

const kid = positional[0] ?? 'dev-key-1';

const { privateKey, publicKey } = await generateKeyPair('ES256');
const privateJwk = await exportJWK(privateKey);
const publicJwk = await exportJWK(publicKey);

privateJwk.kid = kid;
privateJwk.alg = 'ES256';
privateJwk.use = 'sig';

publicJwk.kid = kid;
publicJwk.alg = 'ES256';
publicJwk.use = 'sig';

/** Quote a value for POSIX `source` / `. envfile` without losing JSON characters. */
function shellAssign(name, value) {
  return `${name}='${String(value).replace(/'/g, `'\\''`)}'`;
}

const assignLines = [
  shellAssign('JWT_ACTIVE_KID', kid),
  shellAssign('JWT_PRIVATE_JWK', JSON.stringify(privateJwk)),
  shellAssign('JWT_PUBLIC_JWKS', JSON.stringify({ keys: [publicJwk] })),
];

if (writeEnvPath) {
  writeFileSync(writeEnvPath, `${assignLines.join('\n')}\n`, { mode: 0o600 });
  // Do not print private key material.
  console.log(`Wrote ephemeral JWT env assignments to ${writeEnvPath} (kid=${kid}).`);
  process.exit(0);
}

// Human/dotenv-oriented output (unquoted JSON is fine for .env parsers).
console.log(`JWT_ACTIVE_KID=${kid}`);
console.log(`JWT_PRIVATE_JWK=${JSON.stringify(privateJwk)}`);
console.log(`JWT_PUBLIC_JWKS=${JSON.stringify({ keys: [publicJwk] })}`);
console.log('');
console.log('# Add the lines above to your .env file (development only).');
console.log(`# Generated key id: ${kid} (${randomUUID()})`);
