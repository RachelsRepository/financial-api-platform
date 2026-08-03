import { describe, expect, it } from 'vitest';
import { AuthorizationError } from '../../../src/domain/errors';
import { AccessPolicy, ClientAuthPolicy } from '../../../src/domain/policies/access-policy';
import { ScopeSet, SCOPES } from '../../../src/domain/value-objects';
import {
  buildAwaitingConsent,
  buildConsent,
  buildTokenClaims,
  FIXED_NOW,
  IDS,
} from '../../helpers/mocks';

describe('AccessPolicy', () => {
  const policy = new AccessPolicy();

  it('allows access when token, consent, and scope align', () => {
    const consent = buildConsent();
    consent.submitForAuthorization(FIXED_NOW);
    consent.authorize({
      accountIds: [IDS.account],
      grantedScopes: ScopeSet.fromString(`${SCOPES.ACCOUNTS_READ} ${SCOPES.PAYMENTS_WRITE}`),
      now: FIXED_NOW,
    });
    consent.activate(FIXED_NOW);

    const decision = policy.decideAccountAccess({
      claims: buildTokenClaims(),
      consent,
      requiredScope: SCOPES.ACCOUNTS_READ,
      accountId: IDS.account,
    });

    expect(decision.allowed).toBe(true);
  });

  it('denies mismatched consent', () => {
    const consent = buildAwaitingConsent();
    const decision = policy.decideAccountAccess({
      claims: buildTokenClaims({ consentId: 'other-consent' }),
      consent,
      requiredScope: SCOPES.ACCOUNTS_READ,
    });
    expect(decision.reasonCode).toBe('consent_mismatch');
  });

  it('denies insufficient token scope', () => {
    const consent = buildConsent();
    consent.submitForAuthorization(FIXED_NOW);
    consent.authorize({
      accountIds: [IDS.account],
      grantedScopes: ScopeSet.fromString(SCOPES.ACCOUNTS_READ),
      now: FIXED_NOW,
    });
    consent.activate(FIXED_NOW);

    const decision = policy.decideAccountAccess({
      claims: buildTokenClaims({ scopes: ScopeSet.fromString('openid') }),
      consent,
      requiredScope: SCOPES.ACCOUNTS_READ,
      accountId: IDS.account,
    });
    expect(decision.reasonCode).toBe('insufficient_scope');
  });

  it('throws AuthorizationError from requireAccountAccess', () => {
    expect(() =>
      policy.requireAccountAccess({
        claims: buildTokenClaims({ consentId: 'other-consent' }),
        consent: buildAwaitingConsent(),
        requiredScope: SCOPES.ACCOUNTS_READ,
      }),
    ).toThrow(AuthorizationError);
  });
});

describe('ClientAuthPolicy', () => {
  const policy = new ClientAuthPolicy();

  it('validates authorization request', () => {
    const decision = policy.validateAuthorizationRequest({
      grantTypes: new Set(['authorization_code']),
      redirectUris: new Set(['https://app.example.test/callback']),
      redirectUri: 'https://app.example.test/callback',
      requirePkce: true,
      codeChallenge: 'challenge',
      scopes: ScopeSet.fromString('accounts:read'),
      allowedScopes: ScopeSet.fromString('accounts:read payments:write'),
    });
    expect(decision.allowed).toBe(true);
  });

  it('requires PKCE when configured', () => {
    const decision = policy.validateAuthorizationRequest({
      grantTypes: new Set(['authorization_code']),
      redirectUris: new Set(['https://app.example.test/callback']),
      redirectUri: 'https://app.example.test/callback',
      requirePkce: true,
      codeChallenge: null,
      scopes: ScopeSet.fromString('accounts:read'),
      allowedScopes: ScopeSet.fromString('accounts:read'),
    });
    expect(decision.reasonCode).toBe('pkce_required');
  });
});
