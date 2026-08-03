import type {
  AccessTokenIssueCommand,
  AccessTokenIssuerPort,
  IdTokenIssueCommand,
  IssuedAccessToken,
} from '../../application/ports/access-token-issuer.port';
import type { TokenService } from './token.service';

/** Adapts TokenService to the application AccessTokenIssuerPort. */
export class AccessTokenIssuerAdapter implements AccessTokenIssuerPort {
  constructor(private readonly tokenService: TokenService) {}

  async issueAccessToken(command: AccessTokenIssueCommand): Promise<IssuedAccessToken> {
    return this.tokenService.issueAccessToken({
      sub: command.subject,
      clientId: command.clientId,
      scope: command.scope,
      consentId: command.consentId,
      institutionId: command.institutionId,
      userId: command.userId,
    });
  }

  async issueIdToken(command: IdTokenIssueCommand): Promise<string> {
    return this.tokenService.issueIdToken({
      sub: command.subject,
      clientId: command.clientId,
      scope: command.scope,
      consentId: command.consentId,
      institutionId: command.institutionId,
      userId: command.userId,
      nonce: command.nonce,
    });
  }
}
