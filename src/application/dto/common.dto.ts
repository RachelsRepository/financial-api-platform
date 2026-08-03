import { type TokenClaims } from '../../domain/policies/access-policy';

export interface AuthenticatedContext {
  claims: TokenClaims;
  consentId: string;
}

export interface PaginationOptions {
  cursor?: string;
  limit: number;
}

export interface ConsentSummaryDto {
  id: string;
  status: string;
  requestedScopes: string[];
  grantedScopes: string[] | null;
  authorizedAccountIds: string[];
  purpose: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface AccountSummaryDto {
  id: string;
  accountType: string;
  currency: string;
  displayName: string;
  maskedNumber: string;
  status: string;
}

export interface PaymentSummaryDto {
  id: string;
  status: string;
  amountMinor: number;
  currency: string;
  creditorName: string;
  reference: string;
  sourceAccountId: string;
  providerPaymentId: string | null;
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface InstitutionSummaryDto {
  id: string;
  code: string;
  name: string;
  country: string;
}

export interface TokenResponseDto {
  accessToken: string;
  refreshToken: string | null;
  idToken: string | null;
  tokenType: 'Bearer';
  expiresIn: number;
  scope: string;
}

export interface TokenIntrospectionDto {
  active: boolean;
  scope: string | null;
  clientId: string | null;
  username: string | null;
  sub: string | null;
  exp: number | null;
  iat: number | null;
  consentId: string | null;
  institutionId: string | null;
}
