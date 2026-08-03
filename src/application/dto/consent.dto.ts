import { type ConsentSummaryDto } from './common.dto';

export interface CreateConsentCommand {
  userId: string;
  clientId: string;
  institutionId: string;
  requestedScopes: string;
  purpose: string;
  expiresAt: Date;
  correlationId?: string;
}

export interface CreateConsentResult {
  consent: ConsentSummaryDto;
}

export interface AuthorizeConsentCommand {
  consentId: string;
  accountIds: string[];
  grantedScopes: string;
  actorUserId: string;
  correlationId?: string;
}

export interface AuthorizeConsentResult {
  consent: ConsentSummaryDto;
  authorizationCode: string;
}

export interface ActivateConsentCommand {
  consentId: string;
  actorUserId: string;
  correlationId?: string;
}

export interface ActivateConsentResult {
  consent: ConsentSummaryDto;
}

export interface RevokeConsentCommand {
  consentId: string;
  actorUserId: string;
  correlationId?: string;
}

export interface RevokeConsentResult {
  consent: ConsentSummaryDto;
}

export interface ExpireConsentsCommand {
  batchSize: number;
  correlationId?: string;
}

export interface ExpireConsentsResult {
  expiredCount: number;
  expiredConsentIds: string[];
}

export interface GetConsentCommand {
  consentId: string;
  actorClientId: string;
}

export interface GetConsentResult {
  consent: ConsentSummaryDto;
}
