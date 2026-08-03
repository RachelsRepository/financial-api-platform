/** Port for issuing signed access/ID tokens (JWT) without coupling to crypto libraries. */

export interface AccessTokenIssueCommand {
  subject: string;
  clientId: string;
  scope: string;
  consentId: string;
  institutionId: string;
  userId: string;
}

export interface IssuedAccessToken {
  accessToken: string;
  jti: string;
  expiresInSeconds: number;
}

export interface IdTokenIssueCommand extends AccessTokenIssueCommand {
  nonce?: string;
}

export interface AccessTokenIssuerPort {
  issueAccessToken(command: AccessTokenIssueCommand): Promise<IssuedAccessToken>;
  issueIdToken(command: IdTokenIssueCommand): Promise<string>;
}
