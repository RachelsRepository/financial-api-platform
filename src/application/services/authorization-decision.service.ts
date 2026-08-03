import {
  AccessPolicy,
  ClientAuthPolicy,
  type AuthorizationDecision,
  type TokenClaims,
} from '../../domain/policies/access-policy';
import { type Consent } from '../../domain/entities';
import { type ScopeSet } from '../../domain/value-objects';
import { AuthorizationError } from '../../domain/errors';
import { type ClientRepository } from '../ports/client.repository';

export class AuthorizationDecisionService {
  private readonly accessPolicy = new AccessPolicy();
  private readonly clientAuthPolicy = new ClientAuthPolicy();

  constructor(private readonly clientRepository: ClientRepository) {}

  async decideAccountAccess(input: {
    claims: TokenClaims;
    consent: Consent;
    requiredScope: string;
    accountId?: string;
    expectedInstitutionId?: string;
  }): Promise<AuthorizationDecision> {
    const client = await this.clientRepository.findById(input.consent.clientId);
    if (client === null || !client.isActive) {
      return {
        allowed: false,
        reasonCode: 'invalid_client',
        detail: 'Client application is inactive or missing',
      };
    }

    if (input.claims.clientId !== client.clientId) {
      return {
        allowed: false,
        reasonCode: 'client_mismatch',
        detail: 'Token client does not own consent',
      };
    }

    return this.accessPolicy.decideAccountAccess(input);
  }

  async requireAccountAccess(input: {
    claims: TokenClaims;
    consent: Consent;
    requiredScope: string;
    accountId?: string;
    expectedInstitutionId?: string;
  }): Promise<void> {
    const decision = await this.decideAccountAccess(input);
    if (!decision.allowed) {
      throw new AuthorizationError(decision.detail || decision.reasonCode, decision.reasonCode);
    }
  }

  validateAuthorizationRequest(input: {
    grantTypes: ReadonlySet<string>;
    redirectUris: ReadonlySet<string>;
    redirectUri: string;
    requirePkce: boolean;
    codeChallenge: string | null;
    scopes: ScopeSet;
    allowedScopes: ScopeSet;
  }): AuthorizationDecision {
    return this.clientAuthPolicy.validateAuthorizationRequest(input);
  }
}

export type { AuthorizationDecision, TokenClaims };
