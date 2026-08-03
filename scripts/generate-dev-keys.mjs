#!/usr/bin/env node
/**
 * Generate ES256 signing keys for local development.
 * Outputs JWT_ACTIVE_KID, JWT_PRIVATE_JWK, and JWT_PUBLIC_JWKS for .env.
 */
import { generateKeyPair, exportJWK } from 'jose';
import { randomUUID } from 'node:crypto';

const kid = process.argv[2] ?? 'dev-key-1';

const { privateKey, publicKey } = await generateKeyPair('ES256');
const privateJwk = await exportJWK(privateKey);
const publicJwk = await exportJWK(publicKey);

privateJwk.kid = kid;
privateJwk.alg = 'ES256';
privateJwk.use = 'sig';

publicJwk.kid = kid;
publicJwk.alg = 'ES256';
publicJwk.use = 'sig';

console.log(`JWT_ACTIVE_KID=${kid}`);
console.log(`JWT_PRIVATE_JWK=${JSON.stringify(privateJwk)}`);
console.log(`JWT_PUBLIC_JWKS=${JSON.stringify({ keys: [publicJwk] })}`);
console.log('');
console.log('# Add the lines above to your .env file (development only).');
console.log(`# Generated key id: ${kid} (${randomUUID()})`);
