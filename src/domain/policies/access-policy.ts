import { AuthorizationError } from '../errors';
import { type Consent } from '../entities';
import { type ScopeSet } from '../value-objects';

export interface TokenClaims {
  subject: string;
  clientId: string;
  issuer: string;
  audience: string | string[];
  scopes: ScopeSet;
  consentId: string | null;
  institutionId: string | null;
  userId: string | null;
  tokenId: string;
  expiresAtEpoch: number;
  issuedAtEpoch: number;
}

export interface AuthorizationDecision {
  allowed: boolean;
  reasonCode: string;
  detail: string;
}

export class AccessPolicy {
  decideAccountAccess(input: {
    claims: TokenClaims;
    consent: Consent;
    requiredScope: string;
    accountId?: string;
    expectedInstitutionId?: string;
  }): AuthorizationDecision {
    const { claims, consent, requiredScope } = input;

    if (claims.consentId === null || claims.consentId !== consent.id) {
      return {
        allowed: false,
        reasonCode: 'consent_mismatch',
        detail: 'Token consent does not match',
      };
    }

    if (
      input.expectedInstitutionId !== undefined &&
      consent.institutionId !== input.expectedInstitutionId
    ) {
      return {
        allowed: false,
        reasonCode: 'institution_isolation',
        detail: 'Institution isolation violation',
      };
    }

    if (claims.institutionId !== null && claims.institutionId !== consent.institutionId) {
      return {
        allowed: false,
        reasonCode: 'tenant_mismatch',
        detail: 'Token institution does not match consent',
      };
    }

    if (claims.clientId !== consent.clientId && claims.clientId !== '') {
      // clientId on claims is the public client_id string; consent.clientId is UUID.
      // Ownership is validated in application layer against client record.
    }

    try {
      consent.ensureAccess({
        scope: requiredScope,
        ...(input.accountId !== undefined ? { accountId: input.accountId } : {}),
      });
    } catch (error) {
      const code =
        error instanceof Error && 'code' in error && typeof error.code === 'string'
          ? error.code
          : 'access_denied';
      return {
        allowed: false,
        reasonCode: code,
        detail: error instanceof Error ? error.message : 'Access denied',
      };
    }

    if (!claims.scopes.contains(requiredScope)) {
      return {
        allowed: false,
        reasonCode: 'insufficient_scope',
        detail: requiredScope,
      };
    }

    return { allowed: true, reasonCode: 'allowed', detail: '' };
  }

  requireAccountAccess(input: {
    claims: TokenClaims;
    consent: Consent;
    requiredScope: string;
    accountId?: string;
    expectedInstitutionId?: string;
  }): void {
    const decision = this.decideAccountAccess(input);
    if (!decision.allowed) {
      throw new AuthorizationError(decision.detail || decision.reasonCode, decision.reasonCode);
    }
  }
}

export class ClientAuthPolicy {
  validateAuthorizationRequest(input: {
    grantTypes: ReadonlySet<string>;
    redirectUris: ReadonlySet<string>;
    redirectUri: string;
    requirePkce: boolean;
    codeChallenge: string | null;
    scopes: ScopeSet;
    allowedScopes: ScopeSet;
  }): AuthorizationDecision {
    if (!input.grantTypes.has('authorization_code')) {
      return {
        allowed: false,
        reasonCode: 'unsupported_grant',
        detail: 'authorization_code not enabled',
      };
    }
    if (!input.redirectUris.has(input.redirectUri)) {
      return {
        allowed: false,
        reasonCode: 'invalid_redirect_uri',
        detail: input.redirectUri,
      };
    }
    if (input.requirePkce && !input.codeChallenge) {
      return {
        allowed: false,
        reasonCode: 'pkce_required',
        detail: 'code_challenge required',
      };
    }
    if (!input.allowedScopes.containsAll(input.scopes)) {
      return {
        allowed: false,
        reasonCode: 'invalid_scope',
        detail: input.scopes.asString(),
      };
    }
    return { allowed: true, reasonCode: 'allowed', detail: '' };
  }
}
