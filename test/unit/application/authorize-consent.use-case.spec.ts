import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthorizationError } from '../../../src/domain/errors';
import { ConsentStatus } from '../../../src/domain/policies/state-machines';
import { AuthorizeConsentUseCase } from '../../../src/application/use-cases/consents/authorize-consent.use-case';
import {
  buildAwaitingConsent,
  createAuditMock,
  createClockMock,
  createConsentRepositoryMock,
  createIdGeneratorMock,
  createTokenRepositoryMock,
  createUnitOfWorkMock,
  IDS,
} from '../../helpers/mocks';

describe('AuthorizeConsentUseCase', () => {
  let useCase: AuthorizeConsentUseCase;
  let consentRepository: ReturnType<typeof createConsentRepositoryMock>;

  beforeEach(() => {
    consentRepository = createConsentRepositoryMock(buildAwaitingConsent());
    useCase = new AuthorizeConsentUseCase(
      createUnitOfWorkMock(),
      consentRepository,
      createTokenRepositoryMock(),
      createClockMock(),
      createIdGeneratorMock(),
      createAuditMock(),
    );
  });

  it('authorizes consent and returns authorization code bound to PKCE', async () => {
    const tokenRepository = createTokenRepositoryMock();
    useCase = new AuthorizeConsentUseCase(
      createUnitOfWorkMock(),
      consentRepository,
      tokenRepository,
      createClockMock(),
      createIdGeneratorMock(),
      createAuditMock(),
    );

    const result = await useCase.execute({
      consentId: IDS.consent,
      accountIds: [IDS.account],
      grantedScopes: 'accounts:read payments:write',
      actorUserId: IDS.user,
    });

    expect(result.consent.status).toBe(ConsentStatus.AUTHORIZED);
    expect(result.authorizationCode).toBeTruthy();
    expect(consentRepository.save).toHaveBeenCalled();
    expect(tokenRepository.saveAuthorizationCode).toHaveBeenCalledWith(
      expect.objectContaining({
        redirectUri: 'https://app.example.test/callback',
        codeChallenge: 'challenge',
        codeChallengeMethod: 'S256',
        nonce: 'nonce-1',
      }),
    );
    expect(tokenRepository.markAuthorizationRequestConsumed).toHaveBeenCalled();
  });

  it('rejects when no open authorization request exists', async () => {
    const tokenRepository = createTokenRepositoryMock();
    tokenRepository.findOpenAuthorizationRequestByConsentId = vi.fn(async () => null);
    useCase = new AuthorizeConsentUseCase(
      createUnitOfWorkMock(),
      consentRepository,
      tokenRepository,
      createClockMock(),
      createIdGeneratorMock(),
      createAuditMock(),
    );

    await expect(
      useCase.execute({
        consentId: IDS.consent,
        accountIds: [IDS.account],
        grantedScopes: 'accounts:read',
        actorUserId: IDS.user,
      }),
    ).rejects.toThrow(AuthorizationError);
  });

  it('rejects when user does not own consent', async () => {
    await expect(
      useCase.execute({
        consentId: IDS.consent,
        accountIds: [IDS.account],
        grantedScopes: 'accounts:read',
        actorUserId: '00000000-0000-4000-8000-000000000099',
      }),
    ).rejects.toThrow(AuthorizationError);
  });

  it('rejects when consent is not awaiting authorization', async () => {
    const draft = buildAwaitingConsent();
    draft.status = ConsentStatus.DRAFT;
    consentRepository.findById = vi.fn(async () => draft);

    await expect(
      useCase.execute({
        consentId: IDS.consent,
        accountIds: [IDS.account],
        grantedScopes: 'accounts:read',
        actorUserId: IDS.user,
      }),
    ).rejects.toThrow(AuthorizationError);
  });
});
