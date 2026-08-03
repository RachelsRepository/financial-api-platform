import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { ActivateConsentUseCase } from '../../../application/use-cases/consents/activate-consent.use-case';
import { AuthorizeConsentUseCase } from '../../../application/use-cases/consents/authorize-consent.use-case';
import { CreateConsentUseCase } from '../../../application/use-cases/consents/create-consent.use-case';
import { GetConsentUseCase } from '../../../application/use-cases/consents/get-consent.use-case';
import { RevokeConsentUseCase } from '../../../application/use-cases/consents/revoke-consent.use-case';
import { SCOPES } from '../../../domain/value-objects';
import { consentTransitionsTotal } from '../../../observability/metrics';
import { CurrentAuth, RequireScopes, type AuthContext } from '../decorators/current-auth.decorator';
import {
  ActivateConsentRequestDto,
  AuthorizeConsentRequestDto,
  CreateConsentRequestDto,
  RevokeConsentRequestDto,
} from '../dto/consent.request.dto';
import { BearerAuthGuard } from '../guards/bearer-auth.guard';
import { ScopesGuard } from '../guards/scopes.guard';
import { getCorrelationId } from '../middleware/correlation-id.middleware';

@ApiTags('Consents')
@Controller('api/v1/consents')
export class ConsentsController {
  constructor(
    private readonly createConsent: CreateConsentUseCase,
    private readonly authorizeConsent: AuthorizeConsentUseCase,
    private readonly activateConsent: ActivateConsentUseCase,
    private readonly revokeConsent: RevokeConsentUseCase,
    private readonly getConsent: GetConsentUseCase,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a consent request' })
  async create(@Body() body: CreateConsentRequestDto, @Req() request: FastifyRequest) {
    const result = await this.createConsent.execute({
      userId: body.userId,
      clientId: body.clientId,
      institutionId: body.institutionId,
      requestedScopes: body.requestedScopes,
      purpose: body.purpose,
      expiresAt: new Date(body.expiresAt),
      correlationId: getCorrelationId(request),
    });
    consentTransitionsTotal.inc({ from: 'none', to: result.consent.status });
    return result;
  }

  @Post(':consentId/authorize')
  @ApiOperation({ summary: 'Authorize a consent with account and scope selection' })
  async authorize(
    @Param('consentId', ParseUUIDPipe) consentId: string,
    @Body() body: AuthorizeConsentRequestDto,
    @Req() request: FastifyRequest,
  ) {
    const result = await this.authorizeConsent.execute({
      consentId,
      accountIds: body.accountIds,
      grantedScopes: body.grantedScopes,
      actorUserId: body.actorUserId,
      correlationId: getCorrelationId(request),
    });
    consentTransitionsTotal.inc({ from: 'awaiting_authorization', to: result.consent.status });
    return result;
  }

  @Post(':consentId/activate')
  @ApiOperation({ summary: 'Activate an authorized consent' })
  async activate(
    @Param('consentId', ParseUUIDPipe) consentId: string,
    @Body() body: ActivateConsentRequestDto,
    @Req() request: FastifyRequest,
  ) {
    const result = await this.activateConsent.execute({
      consentId,
      actorUserId: body.actorUserId,
      correlationId: getCorrelationId(request),
    });
    consentTransitionsTotal.inc({ from: 'authorized', to: result.consent.status });
    return result;
  }

  @Post(':consentId/revoke')
  @ApiBearerAuth()
  @UseGuards(BearerAuthGuard, ScopesGuard)
  @RequireScopes(SCOPES.CONSENT_MANAGE)
  @ApiOperation({ summary: 'Revoke an active consent' })
  async revoke(
    @Param('consentId', ParseUUIDPipe) consentId: string,
    @Body() body: RevokeConsentRequestDto,
    @Req() request: FastifyRequest,
  ) {
    const result = await this.revokeConsent.execute({
      consentId,
      actorUserId: body.actorUserId,
      correlationId: getCorrelationId(request),
    });
    consentTransitionsTotal.inc({ from: 'active', to: result.consent.status });
    return result;
  }

  @Get(':consentId')
  @ApiBearerAuth()
  @UseGuards(BearerAuthGuard, ScopesGuard)
  @RequireScopes(SCOPES.CONSENT_MANAGE)
  @ApiOperation({ summary: 'Get consent details' })
  async get(
    @Param('consentId', ParseUUIDPipe) consentId: string,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.getConsent.execute({
      consentId,
      actorClientId: auth.claims.clientId,
    });
  }
}
