import { createHash, randomBytes } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsentStatus } from '../../../src/domain/policies/state-machines';
import { ScopeSet, SCOPES } from '../../../src/domain/value-objects';
import { ExchangeAuthorizationCodeUseCase } from '../../../src/application/use-cases/identity/exchange-authorization-code.use-case';
import { AccessTokenIssuerAdapter } from '../../../src/infrastructure/identity/access-token-issuer.adapter';
import { TokenService } from '../../../src/infrastructure/identity/token.service';
import { exportJWK, generateKeyPair } from 'jose';
import {
  buildConsent,
  createAuditMock,
  createClockMock,
  createConsentRepositoryMock,
  createCryptoMock,
  createClientRepositoryMock,
  createIdGeneratorMock,
  createTokenRepositoryMock,
  createUnitOfWorkMock,
  FIXED_NOW,
  IDS,
} from '../../helpers/mocks';

function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

describe('ExchangeAuthorizationCodeUseCase', () => {
  let useCase: ExchangeAuthorizationCodeUseCase;
  let tokenRepository: ReturnType<typeof createTokenRepositoryMock>;
  let tokenService: TokenService;
  let crypto: ReturnType<typeof createCryptoMock>;

  beforeEach(async () => {
    const { privateKey } = await generateKeyPair('ES256');
    const privateJwk = await exportJWK(privateKey);
    privateJwk.kid = 'test-key-1';
    privateJwk.alg = 'ES256';
    privateJwk.use = 'sig';

    tokenService = new TokenService({
      issuer: 'https://auth.example.test',
      audience: 'financial-api',
      accessTokenTtlSeconds: 300,
      clockSkewSeconds: 30,
      activeKid: 'test-key-1',
      privateJwk,
    });
    await tokenService.initialize();

    tokenRepository = createTokenRepositoryMock();
    crypto = createCryptoMock();
    crypto.verifyPkce = vi.fn((verifier, challenge) => {
      const expected = createHash('sha256').update(verifier).digest('base64url');
      return expected === challenge;
    });

    const authorized = buildConsent();
    authorized.submitForAuthorization(FIXED_NOW);
    authorized.authorize({
      accountIds: [IDS.account],
      grantedScopes: ScopeSet.fromString(
        `${SCOPES.ACCOUNTS_READ} ${SCOPES.PAYMENTS_WRITE} ${SCOPES.OPENID} ${SCOPES.OFFLINE_ACCESS}`,
      ),
      now: FIXED_NOW,
    });

    useCase = new ExchangeAuthorizationCodeUseCase(
      createUnitOfWorkMock(),
      createClientRepositoryMock(),
      createConsentRepositoryMock(authorized),
      tokenRepository,
      new AccessTokenIssuerAdapter(tokenService),
      crypto,
      createClockMock(),
      createIdGeneratorMock(),
      createAuditMock(),
    );
  });

  it('issues a JWT access token that validates and stores jti', async () => {
    const { verifier, challenge } = pkcePair();
    tokenRepository.findAuthorizationCode = vi.fn(async () => ({
      code: 'auth-code-1',
      clientId: IDS.client,
      userId: IDS.user,
      consentId: IDS.consent,
      redirectUri: 'https://app.example.test/callback',
      scopes: ScopeSet.fromString(
        `${SCOPES.ACCOUNTS_READ} ${SCOPES.PAYMENTS_WRITE} ${SCOPES.OPENID} ${SCOPES.OFFLINE_ACCESS}`,
      ),
      codeChallenge: challenge,
      codeChallengeMethod: 'S256',
      nonce: 'oidc-nonce-1',
      expiresAt: new Date(FIXED_NOW.getTime() + 60_000),
      usedAt: null,
      createdAt: FIXED_NOW,
    }));

    const result = await useCase.execute({
      clientId: IDS.clientPublic,
      clientSecret: 'secret',
      code: 'auth-code-1',
      redirectUri: 'https://app.example.test/callback',
      codeVerifier: verifier,
    });

    expect(result.accessToken.split('.')).toHaveLength(3);
    expect(result.idToken).toBeTruthy();
    expect(result.idToken?.split('.')).toHaveLength(3);
    const verified = await tokenService.validateAccessToken(result.accessToken);
    expect(verified.consentId).toBe(IDS.consent);
    expect(verified.clientId).toBe(IDS.clientPublic);
    expect(tokenRepository.saveAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({ tokenHash: verified.jti }),
    );
    expect(tokenRepository.markAuthorizationCodeUsed).toHaveBeenCalled();
    expect(result.refreshToken).toBeTruthy();
  });

  it('rejects authorization code reuse', async () => {
    const { verifier, challenge } = pkcePair();
    tokenRepository.findAuthorizationCode = vi.fn(async () => ({
      code: 'auth-code-1',
      clientId: IDS.client,
      userId: IDS.user,
      consentId: IDS.consent,
      redirectUri: 'https://app.example.test/callback',
      scopes: ScopeSet.fromString(SCOPES.ACCOUNTS_READ),
      codeChallenge: challenge,
      codeChallengeMethod: 'S256',
      nonce: null,
      expiresAt: new Date(FIXED_NOW.getTime() + 60_000),
      usedAt: FIXED_NOW,
      createdAt: FIXED_NOW,
    }));

    await expect(
      useCase.execute({
        clientId: IDS.clientPublic,
        clientSecret: 'secret',
        code: 'auth-code-1',
        redirectUri: 'https://app.example.test/callback',
        codeVerifier: verifier,
      }),
    ).rejects.toThrow(/already used/);
  });

  it('rejects invalid PKCE verifier', async () => {
    const { challenge } = pkcePair();
    tokenRepository.findAuthorizationCode = vi.fn(async () => ({
      code: 'auth-code-1',
      clientId: IDS.client,
      userId: IDS.user,
      consentId: IDS.consent,
      redirectUri: 'https://app.example.test/callback',
      scopes: ScopeSet.fromString(SCOPES.ACCOUNTS_READ),
      codeChallenge: challenge,
      codeChallengeMethod: 'S256',
      nonce: null,
      expiresAt: new Date(FIXED_NOW.getTime() + 60_000),
      usedAt: null,
      createdAt: FIXED_NOW,
    }));

    await expect(
      useCase.execute({
        clientId: IDS.clientPublic,
        clientSecret: 'secret',
        code: 'auth-code-1',
        redirectUri: 'https://app.example.test/callback',
        codeVerifier: 'wrong-verifier',
      }),
    ).rejects.toThrow(/PKCE/);
  });

  it('rejects exchange when consent is revoked', async () => {
    const { verifier, challenge } = pkcePair();
    const revoked = buildConsent();
    revoked.status = ConsentStatus.REVOKED;
    useCase = new ExchangeAuthorizationCodeUseCase(
      createUnitOfWorkMock(),
      createClientRepositoryMock(),
      createConsentRepositoryMock(revoked),
      tokenRepository,
      new AccessTokenIssuerAdapter(tokenService),
      crypto,
      createClockMock(),
      createIdGeneratorMock(),
      createAuditMock(),
    );

    tokenRepository.findAuthorizationCode = vi.fn(async () => ({
      code: 'auth-code-1',
      clientId: IDS.client,
      userId: IDS.user,
      consentId: IDS.consent,
      redirectUri: 'https://app.example.test/callback',
      scopes: ScopeSet.fromString(SCOPES.ACCOUNTS_READ),
      codeChallenge: challenge,
      codeChallengeMethod: 'S256',
      nonce: null,
      expiresAt: new Date(FIXED_NOW.getTime() + 60_000),
      usedAt: null,
      createdAt: FIXED_NOW,
    }));

    await expect(
      useCase.execute({
        clientId: IDS.clientPublic,
        clientSecret: 'secret',
        code: 'auth-code-1',
        redirectUri: 'https://app.example.test/callback',
        codeVerifier: verifier,
      }),
    ).rejects.toThrow(/Consent is not authorized/);
  });
});
