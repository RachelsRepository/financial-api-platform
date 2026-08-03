import { type RefreshTokenFamily } from '../../domain/entities';
import { type ScopeSet } from '../../domain/value-objects';

export interface AuthorizationCodeRecord {
  code: string;
  clientId: string;
  userId: string;
  consentId: string;
  redirectUri: string;
  scopes: ScopeSet;
  codeChallenge: string | null;
  codeChallengeMethod: string | null;
  nonce: string | null;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

export interface AccessTokenRecord {
  tokenId: string;
  tokenHash: string;
  clientId: string;
  userId: string;
  consentId: string;
  institutionId: string;
  scopes: ScopeSet;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

export interface RefreshTokenRecord {
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

export interface AuthorizationRequestRecord {
  id: string;
  clientId: string;
  consentId: string;
  redirectUri: string;
  scopes: ScopeSet;
  state: string;
  nonce: string | null;
  codeChallenge: string;
  codeChallengeMethod: string;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}

export interface TokenRepository {
  saveAuthorizationCode(record: AuthorizationCodeRecord): Promise<void>;
  findAuthorizationCode(code: string): Promise<AuthorizationCodeRecord | null>;
  markAuthorizationCodeUsed(code: string, usedAt: Date): Promise<void>;

  saveAuthorizationRequest(record: AuthorizationRequestRecord): Promise<void>;
  findOpenAuthorizationRequestByConsentId(
    consentId: string,
  ): Promise<AuthorizationRequestRecord | null>;
  markAuthorizationRequestConsumed(id: string, consumedAt: Date): Promise<void>;

  saveAccessToken(record: AccessTokenRecord): Promise<void>;
  findAccessTokenByHash(tokenHash: string): Promise<AccessTokenRecord | null>;
  findAccessTokenByJti(jti: string): Promise<AccessTokenRecord | null>;
  revokeAccessToken(tokenId: string, revokedAt: Date): Promise<void>;
  revokeAccessTokensForConsent(consentId: string, revokedAt: Date): Promise<void>;

  saveRefreshTokenFamily(family: RefreshTokenFamily): Promise<void>;
  findRefreshTokenFamilyById(familyId: string): Promise<RefreshTokenFamily | null>;
  findRefreshTokenFamilyByHash(tokenHash: string): Promise<RefreshTokenFamily | null>;
  rotateRefreshToken(
    familyId: string,
    newTokenHash: string,
    generation: number,
    expiresAt: Date,
  ): Promise<void>;
  revokeRefreshTokenFamily(familyId: string, revokedAt: Date): Promise<void>;
  revokeRefreshTokenFamiliesForConsent(consentId: string, revokedAt: Date): Promise<void>;
  markReuseDetected(familyId: string, detectedAt: Date): Promise<void>;
}
