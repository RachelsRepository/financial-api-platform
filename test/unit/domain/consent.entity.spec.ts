import { describe, expect, it } from 'vitest';
import {
  AccountNotAuthorizedError,
  ConsentExpiredError,
  ConsentNotActiveError,
  InvalidStateTransitionError,
  ScopeNotGrantedError,
} from '../../../src/domain/errors';
import { ConsentStatus } from '../../../src/domain/policies/state-machines';
import { ScopeSet, SCOPES } from '../../../src/domain/value-objects';
import { buildConsent, FIXED_NOW, IDS } from '../../helpers/mocks';

describe('Consent entity', () => {
  it('creates draft consent', () => {
    const consent = buildConsent();
    expect(consent.status).toBe(ConsentStatus.DRAFT);
    expect(consent.version).toBe(1);
  });

  it('moves through authorization lifecycle', () => {
    const consent = buildConsent();
    consent.submitForAuthorization(FIXED_NOW);
    expect(consent.status).toBe(ConsentStatus.AWAITING_AUTHORIZATION);

    consent.authorize({
      accountIds: [IDS.account],
      grantedScopes: ScopeSet.fromString(`${SCOPES.ACCOUNTS_READ} ${SCOPES.PAYMENTS_WRITE}`),
      now: FIXED_NOW,
    });
    expect(consent.status).toBe(ConsentStatus.AUTHORIZED);
    expect(consent.grantedScopes?.contains(SCOPES.ACCOUNTS_READ)).toBe(true);

    consent.activate(FIXED_NOW);
    expect(consent.status).toBe(ConsentStatus.ACTIVE);
  });

  it('rejects authorize with no overlapping scopes', () => {
    const consent = buildConsent();
    consent.submitForAuthorization(FIXED_NOW);
    expect(() =>
      consent.authorize({
        accountIds: [IDS.account],
        grantedScopes: ScopeSet.fromString('beneficiaries:read'),
        now: FIXED_NOW,
      }),
    ).toThrow(ScopeNotGrantedError);
  });

  it('revokes and expires from valid states', () => {
    const consent = buildConsent();
    consent.submitForAuthorization(FIXED_NOW);
    consent.authorize({
      accountIds: [IDS.account],
      grantedScopes: ScopeSet.fromString(SCOPES.ACCOUNTS_READ),
      now: FIXED_NOW,
    });
    consent.revoke(FIXED_NOW);
    expect(consent.status).toBe(ConsentStatus.REVOKED);
  });

  it('rejects invalid transitions', () => {
    const consent = buildConsent();
    expect(() => consent.activate()).toThrow(InvalidStateTransitionError);
  });

  it('enforces access rules', () => {
    const consent = buildConsent();
    consent.submitForAuthorization(FIXED_NOW);
    consent.authorize({
      accountIds: [IDS.account],
      grantedScopes: ScopeSet.fromString(SCOPES.ACCOUNTS_READ),
      now: FIXED_NOW,
    });
    consent.activate(FIXED_NOW);

    expect(() =>
      consent.ensureAccess({
        scope: SCOPES.PAYMENTS_WRITE,
        accountId: IDS.account,
        now: FIXED_NOW,
      }),
    ).toThrow(ScopeNotGrantedError);

    expect(() =>
      consent.ensureAccess({
        scope: SCOPES.ACCOUNTS_READ,
        accountId: 'other-account',
        now: FIXED_NOW,
      }),
    ).toThrow(AccountNotAuthorizedError);

    expect(() =>
      consent.ensureAccess({
        scope: SCOPES.ACCOUNTS_READ,
        accountId: IDS.account,
        now: new Date('2031-01-01T00:00:00.000Z'),
      }),
    ).toThrow(ConsentExpiredError);
  });

  it('rejects access when consent is not active', () => {
    const consent = buildConsent();
    consent.submitForAuthorization(FIXED_NOW);
    expect(() => consent.ensureAccess({ scope: SCOPES.ACCOUNTS_READ, now: FIXED_NOW })).toThrow(
      ConsentNotActiveError,
    );
  });
});
