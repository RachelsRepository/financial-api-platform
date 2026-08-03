import { createHash, randomBytes } from 'node:crypto';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { exportJWK, generateKeyPair } from 'jose';
import { Money, SCOPES } from '../../src/domain/value-objects';
import { PaymentStatus } from '../../src/domain/policies/state-machines';
import { Payment, type Consent, type RefreshTokenFamily } from '../../src/domain/entities';
import { CreateAuthorizationRequestUseCase } from '../../src/application/use-cases/identity/create-authorization-request.use-case';
import { ExchangeAuthorizationCodeUseCase } from '../../src/application/use-cases/identity/exchange-authorization-code.use-case';
import { RefreshTokensUseCase } from '../../src/application/use-cases/identity/refresh-tokens.use-case';
import { AuthorizeConsentUseCase } from '../../src/application/use-cases/consents/authorize-consent.use-case';
import { RevokeConsentUseCase } from '../../src/application/use-cases/consents/revoke-consent.use-case';
import { ProcessProviderCallbackUseCase } from '../../src/application/use-cases/payments/process-provider-callback.use-case';
import { AuthorizationDecisionService } from '../../src/application/services/authorization-decision.service';
import { AccessTokenIssuerAdapter } from '../../src/infrastructure/identity/access-token-issuer.adapter';
import { TokenService } from '../../src/infrastructure/identity/token.service';
import { TokenReuseDetectedError } from '../../src/domain/errors';
import type {
  AuthorizationCodeRecord,
  AuthorizationRequestRecord,
} from '../../src/application/ports/token.repository';
import type { ProviderCallbackRecord } from '../../src/application/ports/provider-callback.repository';
import {
  createAuditMock,
  createClockMock,
  createClientRepositoryMock,
  createCryptoMock,
  createIdGeneratorMock,
  createInstitutionRepositoryMock,
  createPaymentRepositoryMock,
  createTokenRepositoryMock,
  createUnitOfWorkMock,
  FIXED_NOW,
  IDS,
  resetIdCounter,
} from '../helpers/mocks';

describe('Representative OAuth → consent → payment → callback flow', () => {
  let tokenService: TokenService;

  beforeAll(async () => {
    const { privateKey } = await generateKeyPair('ES256');
    const privateJwk = await exportJWK(privateKey);
    privateJwk.kid = 'e2e-key';
    privateJwk.alg = 'ES256';
    privateJwk.use = 'sig';
    tokenService = new TokenService({
      issuer: 'https://auth.example.test',
      audience: 'financial-api',
      accessTokenTtlSeconds: 300,
      clockSkewSeconds: 30,
      activeKid: 'e2e-key',
      privateJwk,
    });
    await tokenService.initialize();
  });

  it('completes the flow and enforces reuse + revocation semantics', async () => {
    resetIdCounter();
    const unitOfWork = createUnitOfWorkMock();
    const clientRepository = createClientRepositoryMock();
    const institutionRepository = createInstitutionRepositoryMock();
    const tokenRepository = createTokenRepositoryMock();
    const paymentRepository = createPaymentRepositoryMock();
    const crypto = createCryptoMock();
    crypto.verifyPkce = vi.fn((verifier: string, challenge: string) => {
      return createHash('sha256').update(verifier).digest('base64url') === challenge;
    });

    const authRequests = new Map<string, AuthorizationRequestRecord>();
    const authCodes = new Map<string, AuthorizationCodeRecord>();
    const refreshByHash = new Map<string, RefreshTokenFamily>();
    const refreshById = new Map<string, RefreshTokenFamily>();
    const callbacks = new Map<string, ProviderCallbackRecord>();
    let consent: Consent | null = null;

    const consentRepository = {
      findById: vi.fn(async (id: string) => (consent?.id === id ? consent : null)),
      save: vi.fn(async (value: Consent) => {
        consent = value;
      }),
      findExpirable: vi.fn(async () => []),
    };

    tokenRepository.saveAuthorizationRequest = vi.fn(async (record) => {
      authRequests.set(record.consentId, record);
    });
    tokenRepository.findOpenAuthorizationRequestByConsentId = vi.fn(async (consentId) => {
      const record = authRequests.get(consentId);
      if (record === undefined || record.consumedAt !== null) {
        return null;
      }
      return record;
    });
    tokenRepository.markAuthorizationRequestConsumed = vi.fn(async (id) => {
      for (const [consentId, record] of authRequests.entries()) {
        if (record.id === id) {
          authRequests.set(consentId, { ...record, consumedAt: FIXED_NOW });
        }
      }
    });
    tokenRepository.saveAuthorizationCode = vi.fn(async (record) => {
      authCodes.set(record.code, record);
    });
    tokenRepository.findAuthorizationCode = vi.fn(async (code) => authCodes.get(code) ?? null);
    tokenRepository.markAuthorizationCodeUsed = vi.fn(async (code) => {
      const existing = authCodes.get(code);
      if (existing) {
        authCodes.set(code, { ...existing, usedAt: FIXED_NOW });
      }
    });
    tokenRepository.saveRefreshTokenFamily = vi.fn(async (family) => {
      refreshById.set(family.id, family);
      refreshByHash.set(family.currentTokenHash, family);
    });
    tokenRepository.findRefreshTokenFamilyByHash = vi.fn(async (hash) => {
      return refreshByHash.get(hash) ?? null;
    });
    tokenRepository.rotateRefreshToken = vi.fn(async (familyId, newHash, generation, expiresAt) => {
      const family = refreshById.get(familyId);
      if (!family) {
        return;
      }
      // Keep historical hash mapped to the family so reuse can be detected.
      const rotated: RefreshTokenFamily = {
        ...family,
        currentTokenHash: newHash,
        generation,
        expiresAt,
      };
      refreshById.set(familyId, rotated);
      refreshByHash.set(newHash, rotated);
      refreshByHash.set(family.currentTokenHash, rotated);
    });
    tokenRepository.markReuseDetected = vi.fn(async (familyId) => {
      const family = refreshById.get(familyId);
      if (!family) {
        return;
      }
      const revoked = { ...family, revokedAt: FIXED_NOW, reuseDetectedAt: FIXED_NOW };
      refreshById.set(familyId, revoked);
      refreshByHash.set(family.currentTokenHash, revoked);
    });
    tokenRepository.revokeRefreshTokenFamily = vi.fn(async (familyId) => {
      const family = refreshById.get(familyId);
      if (!family) {
        return;
      }
      const revoked = { ...family, revokedAt: FIXED_NOW };
      refreshById.set(familyId, revoked);
      refreshByHash.set(family.currentTokenHash, revoked);
    });
    tokenRepository.revokeAccessTokensForConsent = vi.fn(async () => undefined);
    tokenRepository.revokeRefreshTokenFamiliesForConsent = vi.fn(async () => undefined);

    const issuer = new AccessTokenIssuerAdapter(tokenService);
    const decision = new AuthorizationDecisionService(clientRepository);
    const createAuth = new CreateAuthorizationRequestUseCase(
      unitOfWork,
      clientRepository,
      institutionRepository,
      consentRepository,
      tokenRepository,
      decision,
      createClockMock(),
      createIdGeneratorMock(),
      createAuditMock(),
    );
    const authorizeConsent = new AuthorizeConsentUseCase(
      unitOfWork,
      consentRepository,
      tokenRepository,
      createClockMock(),
      createIdGeneratorMock(),
      createAuditMock(),
    );
    const exchange = new ExchangeAuthorizationCodeUseCase(
      unitOfWork,
      clientRepository,
      consentRepository,
      tokenRepository,
      issuer,
      crypto,
      createClockMock(),
      createIdGeneratorMock(),
      createAuditMock(),
    );
    const refresh = new RefreshTokensUseCase(
      unitOfWork,
      clientRepository,
      consentRepository,
      tokenRepository,
      issuer,
      crypto,
      createClockMock(),
      createIdGeneratorMock(),
      createAuditMock(),
    );
    const revokeConsent = new RevokeConsentUseCase(
      unitOfWork,
      consentRepository,
      tokenRepository,
      createClockMock(),
      createIdGeneratorMock(),
      createAuditMock(),
    );

    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');

    const authRequest = await createAuth.execute({
      clientId: IDS.clientPublic,
      redirectUri: 'https://app.example.test/callback',
      scopes: `${SCOPES.ACCOUNTS_READ} ${SCOPES.PAYMENTS_WRITE} ${SCOPES.OPENID} ${SCOPES.OFFLINE_ACCESS}`,
      state: 'state-e2e',
      codeChallenge: challenge,
      codeChallengeMethod: 'S256',
      nonce: 'e2e-nonce',
      userId: IDS.user,
      institutionId: IDS.institution,
      purpose: 'e2e demo',
    });

    const authorized = await authorizeConsent.execute({
      consentId: authRequest.consentId,
      accountIds: [IDS.account],
      grantedScopes: `${SCOPES.ACCOUNTS_READ} ${SCOPES.PAYMENTS_WRITE} ${SCOPES.OPENID} ${SCOPES.OFFLINE_ACCESS}`,
      actorUserId: IDS.user,
    });

    const tokens = await exchange.execute({
      clientId: IDS.clientPublic,
      clientSecret: 'secret',
      code: authorized.authorizationCode,
      redirectUri: 'https://app.example.test/callback',
      codeVerifier: verifier,
    });

    const verified = await tokenService.validateAccessToken(tokens.accessToken);
    expect(verified.consentId).toBe(authRequest.consentId);
    expect(consent?.status).toBe('ACTIVE');
    expect(tokens.refreshToken).toBeTruthy();

    const refreshed = await refresh.execute({
      clientId: IDS.clientPublic,
      clientSecret: 'secret',
      refreshToken: tokens.refreshToken as string,
    });
    expect(refreshed.accessToken).toBeTruthy();

    await expect(
      refresh.execute({
        clientId: IDS.clientPublic,
        clientSecret: 'secret',
        refreshToken: tokens.refreshToken as string,
      }),
    ).rejects.toThrow(TokenReuseDetectedError);

    const payment = Payment.create({
      id: IDS.payment,
      consentId: authRequest.consentId,
      clientId: IDS.client,
      institutionId: IDS.institution,
      userId: IDS.user,
      sourceAccountId: IDS.account,
      amount: Money.of(1500, 'GBP'),
      creditorName: 'Demo Merchant',
      creditorAccountRef: 'GB00DEMO1111111111',
      reference: 'E2E-1',
      providerCode: 'sandbox',
      now: FIXED_NOW,
    });
    payment.requestAuthorization(FIXED_NOW);
    payment.authorize(FIXED_NOW);
    payment.submit('sbx_e2e_payment', FIXED_NOW);
    paymentRepository.findByProviderPaymentId = vi.fn(async () => payment);

    const providerCallbackRepository = {
      findByProviderEvent: vi.fn(async (providerCode: string, eventId: string) => {
        return callbacks.get(`${providerCode}:${eventId}`) ?? null;
      }),
      save: vi.fn(async (record: ProviderCallbackRecord) => {
        callbacks.set(`${record.providerCode}:${record.providerEventId}`, record);
      }),
      markProcessed: vi.fn(async () => undefined),
    };

    const callbackUseCase = new ProcessProviderCallbackUseCase(
      unitOfWork,
      paymentRepository,
      providerCallbackRepository,
      {
        verifyWebhook: async () => ({
          valid: true,
          eventId: 'evt-e2e-1',
          providerPaymentId: 'sbx_e2e_payment',
          normalizedStatus: 'completed',
          reason: null,
        }),
        submitPayment: async () => {
          throw new Error('unused');
        },
        getPaymentStatus: async () => {
          throw new Error('unused');
        },
      },
      crypto,
      createClockMock(),
      createIdGeneratorMock(),
    );

    const callbackResult = await callbackUseCase.execute({
      providerCode: 'sandbox',
      headers: { 'x-sandbox-token': 'sandbox-local' },
      body: JSON.stringify({
        eventId: 'evt-e2e-1',
        paymentId: 'sbx_e2e_payment',
        status: 'completed',
      }),
    });
    expect(callbackResult.processed).toBe(true);
    expect(callbackResult.status).toBe(PaymentStatus.SETTLED);

    const replay = await callbackUseCase.execute({
      providerCode: 'sandbox',
      headers: { 'x-sandbox-token': 'sandbox-local' },
      body: JSON.stringify({
        eventId: 'evt-e2e-1',
        paymentId: 'sbx_e2e_payment',
        status: 'completed',
      }),
    });
    expect(replay.processed).toBe(false);
    expect(replay.status).toBe('duplicate');

    await revokeConsent.execute({
      consentId: authRequest.consentId,
      actorUserId: IDS.user,
    });
    expect(consent?.status).toBe('REVOKED');
    expect(tokenRepository.revokeAccessTokensForConsent).toHaveBeenCalled();
    expect(tokenRepository.revokeRefreshTokenFamiliesForConsent).toHaveBeenCalled();
  });
});
