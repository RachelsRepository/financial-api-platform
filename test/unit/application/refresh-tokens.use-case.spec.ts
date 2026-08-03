import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TokenReuseDetectedError } from '../../../src/domain/errors';
import { ConsentStatus } from '../../../src/domain/policies/state-machines';
import { RefreshTokensUseCase } from '../../../src/application/use-cases/identity/refresh-tokens.use-case';
import {
  buildConsent,
  buildRefreshFamily,
  createAccessTokenIssuerMock,
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

describe('RefreshTokensUseCase', () => {
  let useCase: RefreshTokensUseCase;
  let tokenRepository: ReturnType<typeof createTokenRepositoryMock>;
  let unitOfWork: ReturnType<typeof createUnitOfWorkMock>;
  let crypto: ReturnType<typeof createCryptoMock>;
  let accessTokenIssuer: ReturnType<typeof createAccessTokenIssuerMock>;

  beforeEach(() => {
    tokenRepository = createTokenRepositoryMock();
    unitOfWork = createUnitOfWorkMock();
    crypto = createCryptoMock();
    accessTokenIssuer = createAccessTokenIssuerMock();
    const activeConsent = buildConsent();
    activeConsent.submitForAuthorization(FIXED_NOW);
    activeConsent.authorize({
      accountIds: [IDS.account],
      grantedScopes: activeConsent.requestedScopes,
      now: FIXED_NOW,
    });
    activeConsent.activate(FIXED_NOW);

    useCase = new RefreshTokensUseCase(
      unitOfWork,
      createClientRepositoryMock(),
      createConsentRepositoryMock(activeConsent),
      tokenRepository,
      accessTokenIssuer,
      crypto,
      createClockMock(),
      createIdGeneratorMock(),
      createAuditMock(),
    );
  });

  it('rotates refresh token and issues JWT access token', async () => {
    const family = buildRefreshFamily({ currentTokenHash: 'hash:refresh-token-1' });
    tokenRepository.findRefreshTokenFamilyByHash = vi.fn(async () => family);

    const result = await useCase.execute({
      clientId: IDS.clientPublic,
      clientSecret: 'secret',
      refreshToken: 'refresh-token-1',
    });

    expect(result.accessToken).toBe('jwt.access.token');
    expect(result.refreshToken).toBeTruthy();
    expect(accessTokenIssuer.issueAccessToken).toHaveBeenCalled();
    expect(tokenRepository.rotateRefreshToken).toHaveBeenCalled();
    expect(tokenRepository.saveAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({ tokenHash: IDS.token }),
    );
  });

  it('detects refresh token reuse when family is revoked', async () => {
    tokenRepository.findRefreshTokenFamilyByHash = vi.fn(async () =>
      buildRefreshFamily({ revokedAt: FIXED_NOW }),
    );

    await expect(
      useCase.execute({
        clientId: IDS.clientPublic,
        clientSecret: 'secret',
        refreshToken: 'refresh-token-1',
      }),
    ).rejects.toThrow(TokenReuseDetectedError);

    expect(tokenRepository.markReuseDetected).toHaveBeenCalled();
    expect(tokenRepository.revokeRefreshTokenFamily).toHaveBeenCalled();
  });

  it('detects reuse when presented token does not match current hash', async () => {
    tokenRepository.findRefreshTokenFamilyByHash = vi.fn(async () =>
      buildRefreshFamily({ currentTokenHash: 'hash:current-token' }),
    );
    crypto.compare = vi.fn(async (plain: string) => plain === 'secret');

    await expect(
      useCase.execute({
        clientId: IDS.clientPublic,
        clientSecret: 'secret',
        refreshToken: 'stolen-old-token',
      }),
    ).rejects.toThrow(TokenReuseDetectedError);

    expect(tokenRepository.markReuseDetected).toHaveBeenCalled();
    expect(tokenRepository.revokeRefreshTokenFamily).toHaveBeenCalled();
  });

  it('rejects refresh when consent is not active', async () => {
    const family = buildRefreshFamily({ currentTokenHash: 'hash:refresh-token-1' });
    tokenRepository.findRefreshTokenFamilyByHash = vi.fn(async () => family);
    const revoked = buildConsent();
    revoked.status = ConsentStatus.REVOKED;

    useCase = new RefreshTokensUseCase(
      unitOfWork,
      createClientRepositoryMock(),
      createConsentRepositoryMock(revoked),
      tokenRepository,
      accessTokenIssuer,
      crypto,
      createClockMock(),
      createIdGeneratorMock(),
      createAuditMock(),
    );

    await expect(
      useCase.execute({
        clientId: IDS.clientPublic,
        clientSecret: 'secret',
        refreshToken: 'refresh-token-1',
      }),
    ).rejects.toThrow(/Consent is not active/);
  });
});
