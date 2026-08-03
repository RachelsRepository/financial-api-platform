import { type TokenIntrospectionDto, type TokenResponseDto } from './common.dto';

export interface CreateAuthorizationRequestCommand {
  clientId: string;
  redirectUri: string;
  scopes: string;
  state: string;
  codeChallenge: string | null;
  codeChallengeMethod: string | null;
  nonce: string | null;
  userId: string;
  institutionId: string;
  purpose: string;
  correlationId?: string;
}

export interface CreateAuthorizationRequestResult {
  consentId: string;
  state: string;
  expiresAt: Date;
}

export interface ExchangeAuthorizationCodeCommand {
  clientId: string;
  clientSecret: string | null;
  code: string;
  redirectUri: string;
  codeVerifier: string | null;
  correlationId?: string;
}

export interface ExchangeAuthorizationCodeResult extends TokenResponseDto {
  consentId: string;
}

export interface RefreshTokensCommand {
  clientId: string;
  clientSecret: string | null;
  refreshToken: string;
  correlationId?: string;
}

export type RefreshTokensResult = TokenResponseDto;

export interface RevokeTokenCommand {
  token: string;
  tokenTypeHint?: 'access_token' | 'refresh_token';
  clientId: string;
  correlationId?: string;
}

export interface RevokeTokenResult {
  revoked: boolean;
}

export interface IntrospectTokenCommand {
  token: string;
  clientId: string;
}

export type IntrospectTokenResult = TokenIntrospectionDto;
