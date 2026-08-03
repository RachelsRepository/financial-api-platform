/** Port for validating signed access tokens (JWT) without coupling to jose. */

export interface ValidatedAccessToken {
  subject: string;
  clientId: string;
  scope: string;
  consentId: string | null;
  institutionId: string | null;
  userId: string | null;
  jti: string;
  expiresAtEpoch: number;
  issuedAtEpoch: number;
}

export interface AccessTokenValidatorPort {
  validateAccessToken(token: string): Promise<ValidatedAccessToken>;
}
