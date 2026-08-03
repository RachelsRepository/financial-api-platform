import { vi } from 'vitest';
import { Consent, type RefreshTokenFamily } from '../../src/domain/entities';
import { ScopeSet, SCOPES } from '../../src/domain/value-objects';
import type { AuditPort } from '../../src/application/ports/audit.port';
import type { ClientRepository } from '../../src/application/ports/client.repository';
import type { ClockPort } from '../../src/application/ports/clock.port';
import type { ConsentRepository } from '../../src/application/ports/consent.repository';
import type { CryptoPort } from '../../src/application/ports/crypto.port';
import type { IdGeneratorPort } from '../../src/application/ports/id-generator.port';
import type { InstitutionRepository } from '../../src/application/ports/institution.repository';
import type { PaymentRepository } from '../../src/application/ports/payment.repository';
import type { TokenRepository } from '../../src/application/ports/token.repository';
import type {
  UnitOfWorkContext,
  UnitOfWorkPort,
} from '../../src/application/ports/unit-of-work.port';
import type { TokenClaims } from '../../src/domain/policies/access-policy';

export const IDS = {
  consent: '00000000-0000-4000-8000-000000000001',
  payment: '00000000-0000-4000-8000-000000000002',
  client: '00000000-0000-4000-8000-000000000003',
  clientPublic: 'demo-client-app',
  user: '00000000-0000-4000-8000-000000000004',
  institution: '00000000-0000-4000-8000-000000000005',
  account: '00000000-0000-4000-8000-000000000006',
  family: '00000000-0000-4000-8000-000000000007',
  token: '00000000-0000-4000-8000-000000000008',
} as const;

export const FIXED_NOW = new Date('2026-01-15T12:00:00.000Z');
export const FIXED_EXPIRY = new Date('2030-12-31T23:59:59.000Z');

let idCounter = 0;

export function nextId(prefix = '00000000-0000-4000-8000'): string {
  idCounter += 1;
  return `${prefix}-${String(idCounter).padStart(12, '0')}`;
}

export function resetIdCounter(): void {
  idCounter = 0;
}

export function buildConsent(
  overrides: Partial<Parameters<typeof Consent.create>[0]> = {},
): Consent {
  return Consent.create({
    id: IDS.consent,
    userId: IDS.user,
    clientId: IDS.client,
    institutionId: IDS.institution,
    requestedScopes: ScopeSet.fromString('accounts:read payments:write openid offline_access'),
    purpose: 'Account aggregation and payments',
    expiresAt: FIXED_EXPIRY,
    now: FIXED_NOW,
    ...overrides,
  });
}

export function buildAwaitingConsent(): Consent {
  const consent = buildConsent();
  consent.submitForAuthorization(FIXED_NOW);
  return consent;
}

export function buildTokenClaims(overrides: Partial<TokenClaims> = {}): TokenClaims {
  return {
    subject: IDS.user,
    clientId: IDS.clientPublic,
    issuer: 'https://auth.example.test',
    audience: 'financial-api',
    scopes: ScopeSet.fromString('accounts:read payments:write'),
    consentId: IDS.consent,
    institutionId: IDS.institution,
    userId: IDS.user,
    tokenId: IDS.token,
    expiresAtEpoch: Math.floor(FIXED_NOW.getTime() / 1000) + 3600,
    issuedAtEpoch: Math.floor(FIXED_NOW.getTime() / 1000),
    ...overrides,
  };
}

export function buildRefreshFamily(
  overrides: Partial<RefreshTokenFamily> = {},
): RefreshTokenFamily {
  return {
    id: IDS.family,
    clientId: IDS.client,
    userId: IDS.user,
    consentId: IDS.consent,
    currentTokenHash: 'hash:current',
    scopes: ScopeSet.fromString(`${SCOPES.ACCOUNTS_READ} ${SCOPES.OFFLINE_ACCESS}`),
    expiresAt: FIXED_EXPIRY,
    revokedAt: null,
    reuseDetectedAt: null,
    generation: 1,
    createdAt: FIXED_NOW,
    ...overrides,
  };
}

export function createTransactionContext(): UnitOfWorkContext {
  const events: unknown[] = [];
  return {
    addOutboxEvent: vi.fn((event) => {
      events.push(event);
    }),
  };
}

export function createUnitOfWorkMock(): UnitOfWorkPort {
  return {
    runInTransaction: vi.fn(async (fn) => fn(createTransactionContext())),
  };
}

export function createClockMock(now = FIXED_NOW): ClockPort {
  return { now: vi.fn(() => now) };
}

export function createIdGeneratorMock(): IdGeneratorPort {
  return { generate: vi.fn(() => nextId()) };
}

export function createAuditMock(): AuditPort {
  return { record: vi.fn(async () => undefined) };
}

export function createCryptoMock(): CryptoPort {
  return {
    hash: vi.fn(async (value: string) => `hash:${value}`),
    compare: vi.fn(async (plain: string, stored: string) => {
      if (stored === `hash:${plain}` || stored === plain) {
        return true;
      }
      if (stored.startsWith('scrypt:') && plain === 'secret') {
        return true;
      }
      return false;
    }),
    verifyPkce: vi.fn(() => true),
  };
}

export function createConsentRepositoryMock(
  consent: Consent | null = buildAwaitingConsent(),
): ConsentRepository {
  return {
    findById: vi.fn(async () => consent),
    save: vi.fn(async () => undefined),
    findExpirable: vi.fn(async () => []),
  };
}

export function createClientRepositoryMock(): ClientRepository {
  return {
    findById: vi.fn(async () => ({
      id: IDS.client,
      clientId: IDS.clientPublic,
      name: 'Demo Client',
      clientSecretHash: 'scrypt:salt:hash:secret',
      grantTypes: new Set(['authorization_code', 'refresh_token']),
      redirectUris: new Set(['https://app.example.test/callback']),
      allowedScopes: ScopeSet.fromString('accounts:read payments:write openid offline_access'),
      tokenEndpointAuthMethod: 'client_secret_post',
      requirePkce: true,
      requireMtls: false,
      isConfidential: true,
      isActive: true,
      createdAt: FIXED_NOW,
    })),
    findByClientId: vi.fn(async () => ({
      id: IDS.client,
      clientId: IDS.clientPublic,
      name: 'Demo Client',
      clientSecretHash: 'scrypt:salt:hash:secret',
      grantTypes: new Set(['authorization_code', 'refresh_token']),
      redirectUris: new Set(['https://app.example.test/callback']),
      allowedScopes: ScopeSet.fromString('accounts:read payments:write openid offline_access'),
      tokenEndpointAuthMethod: 'client_secret_post',
      requirePkce: true,
      requireMtls: false,
      isConfidential: true,
      isActive: true,
      createdAt: FIXED_NOW,
    })),
  };
}

export function createAccessTokenIssuerMock() {
  return {
    issueAccessToken: vi.fn(async () => ({
      accessToken: 'jwt.access.token',
      jti: IDS.token,
      expiresInSeconds: 3600,
    })),
    issueIdToken: vi.fn(async () => 'jwt.id.token'),
  };
}

export function createAccessTokenValidatorMock() {
  return {
    validateAccessToken: vi.fn(async () => ({
      subject: IDS.user,
      clientId: IDS.clientPublic,
      scope: 'accounts:read',
      consentId: IDS.consent,
      institutionId: IDS.institution,
      userId: IDS.user,
      jti: IDS.token,
      expiresAtEpoch: Math.floor(FIXED_NOW.getTime() / 1000) + 3600,
      issuedAtEpoch: Math.floor(FIXED_NOW.getTime() / 1000),
    })),
  };
}

export function createTokenRepositoryMock(
  family: RefreshTokenFamily | null = buildRefreshFamily(),
): TokenRepository {
  return {
    findRefreshTokenFamilyByHash: vi.fn(async () => family),
    rotateRefreshToken: vi.fn(async () => undefined),
    saveAccessToken: vi.fn(async () => undefined),
    markReuseDetected: vi.fn(async () => undefined),
    revokeRefreshTokenFamily: vi.fn(async () => undefined),
    revokeRefreshTokenFamiliesForConsent: vi.fn(async () => undefined),
    saveAuthorizationCode: vi.fn(async () => undefined),
    findAuthorizationCode: vi.fn(async () => null),
    markAuthorizationCodeUsed: vi.fn(async () => undefined),
    saveAuthorizationRequest: vi.fn(async () => undefined),
    findOpenAuthorizationRequestByConsentId: vi.fn(async () => ({
      id: nextId(),
      clientId: IDS.client,
      consentId: IDS.consent,
      redirectUri: 'https://app.example.test/callback',
      scopes: ScopeSet.fromString('accounts:read payments:write openid offline_access'),
      state: 'state-1',
      codeChallenge: 'challenge',
      codeChallengeMethod: 'S256',
      nonce: 'nonce-1',
      expiresAt: FIXED_EXPIRY,
      consumedAt: null,
      createdAt: FIXED_NOW,
    })),
    markAuthorizationRequestConsumed: vi.fn(async () => undefined),
    revokeAccessToken: vi.fn(async () => undefined),
    revokeAccessTokensForConsent: vi.fn(async () => undefined),
    findAccessTokenByHash: vi.fn(async () => null),
    findAccessTokenByJti: vi.fn(async () => null),
    saveRefreshTokenFamily: vi.fn(async () => undefined),
    findRefreshTokenFamilyById: vi.fn(async () => null),
  };
}

export function createPaymentRepositoryMock(): PaymentRepository {
  return {
    findById: vi.fn(async () => null),
    findByProviderPaymentId: vi.fn(async () => null),
    findByIdempotencyKey: vi.fn(async () => null),
    findSubmitted: vi.fn(async () => []),
    save: vi.fn(async () => undefined),
  };
}

export function createInstitutionRepositoryMock() {
  return {
    findById: vi.fn(async () => ({
      id: IDS.institution,
      code: 'demo-bank',
      name: 'Demo Bank',
      country: 'GB',
      providerCode: 'sandbox',
      isActive: true,
      createdAt: FIXED_NOW,
    })),
    listActive: vi.fn(async () => []),
    findByCode: vi.fn(async () => null),
  } satisfies InstitutionRepository;
}
