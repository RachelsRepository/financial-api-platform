import { Consent } from '../../../domain/entities';
import { createDomainEvent, EventTypes } from '../../../domain/events';
import { AuthorizationError } from '../../../domain/errors';
import { ScopeSet } from '../../../domain/value-objects';
import {
  type CreateAuthorizationRequestCommand,
  type CreateAuthorizationRequestResult,
} from '../../dto/identity.dto';
import { type AuditPort } from '../../ports/audit.port';
import { type ClientRepository } from '../../ports/client.repository';
import { type ClockPort } from '../../ports/clock.port';
import { type ConsentRepository } from '../../ports/consent.repository';
import { type IdGeneratorPort } from '../../ports/id-generator.port';
import { type InstitutionRepository } from '../../ports/institution.repository';
import { type TokenRepository } from '../../ports/token.repository';
import { type UnitOfWorkPort } from '../../ports/unit-of-work.port';
import { type AuthorizationDecisionService } from '../../services/authorization-decision.service';

const DEFAULT_CONSENT_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const AUTH_REQUEST_TTL_MS = 10 * 60 * 1000;

export class CreateAuthorizationRequestUseCase {
  constructor(
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly clientRepository: ClientRepository,
    private readonly institutionRepository: InstitutionRepository,
    private readonly consentRepository: ConsentRepository,
    private readonly tokenRepository: TokenRepository,
    private readonly authorizationDecision: AuthorizationDecisionService,
    private readonly clock: ClockPort,
    private readonly idGenerator: IdGeneratorPort,
    private readonly audit: AuditPort,
  ) {}

  async execute(
    command: CreateAuthorizationRequestCommand,
  ): Promise<CreateAuthorizationRequestResult> {
    const client = await this.clientRepository.findByClientId(command.clientId);
    if (client === null || !client.isActive) {
      throw new AuthorizationError('Unknown or inactive client', 'invalid_client');
    }

    const institution = await this.institutionRepository.findById(command.institutionId);
    if (institution === null || !institution.isActive) {
      throw new AuthorizationError('Unknown or inactive institution', 'invalid_institution');
    }

    const requestedScopes = ScopeSet.fromString(command.scopes);
    const decision = this.authorizationDecision.validateAuthorizationRequest({
      grantTypes: client.grantTypes,
      redirectUris: client.redirectUris,
      redirectUri: command.redirectUri,
      requirePkce: client.requirePkce,
      codeChallenge: command.codeChallenge,
      scopes: requestedScopes,
      allowedScopes: client.allowedScopes,
    });
    if (!decision.allowed) {
      throw new AuthorizationError(decision.detail, decision.reasonCode);
    }

    const codeChallenge = command.codeChallenge;
    if (codeChallenge === null || codeChallenge.length === 0) {
      throw new AuthorizationError('code_challenge is required', 'invalid_request');
    }

    const now = this.clock.now();
    const expiresAt = new Date(now.getTime() + DEFAULT_CONSENT_TTL_MS);
    const authRequestExpiresAt = new Date(now.getTime() + AUTH_REQUEST_TTL_MS);

    const consent = Consent.create({
      id: this.idGenerator.generate(),
      userId: command.userId,
      clientId: client.id,
      institutionId: command.institutionId,
      requestedScopes,
      purpose: command.purpose,
      expiresAt,
      now,
    });
    consent.submitForAuthorization(now);

    const authorizationRequestId = this.idGenerator.generate();

    await this.unitOfWork.runInTransaction(async (ctx) => {
      await this.consentRepository.save(consent);
      await this.tokenRepository.saveAuthorizationRequest({
        id: authorizationRequestId,
        clientId: client.id,
        consentId: consent.id,
        redirectUri: command.redirectUri,
        scopes: requestedScopes,
        state: command.state,
        nonce: command.nonce,
        codeChallenge,
        codeChallengeMethod: command.codeChallengeMethod ?? 'S256',
        expiresAt: authRequestExpiresAt,
        consumedAt: null,
        createdAt: now,
      });
      ctx.addOutboxEvent(
        createDomainEvent({
          eventId: this.idGenerator.generate(),
          aggregateId: consent.id,
          aggregateType: 'Consent',
          eventType: EventTypes.CONSENT_CREATED,
          version: consent.version,
          timestamp: now,
          correlationId: command.correlationId,
          payload: {
            userId: consent.userId,
            clientId: client.clientId,
            institutionId: consent.institutionId,
            requestedScopes: consent.requestedScopes.asString(),
            state: command.state,
          },
        }),
      );
    });

    await this.audit.record({
      action: 'identity.authorization_request_created',
      actorId: command.clientId,
      actorType: 'client',
      resourceType: 'Consent',
      resourceId: consent.id,
      institutionId: command.institutionId,
      metadata: { state: command.state },
      timestamp: now,
    });

    return {
      consentId: consent.id,
      state: command.state,
      expiresAt: consent.expiresAt,
    };
  }
}
