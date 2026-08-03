import type {
  AccessTokenValidatorPort,
  ValidatedAccessToken,
} from '../../application/ports/access-token-validator.port';
import type { TokenService } from './token.service';

export class AccessTokenValidatorAdapter implements AccessTokenValidatorPort {
  constructor(private readonly tokenService: TokenService) {}

  async validateAccessToken(token: string): Promise<ValidatedAccessToken> {
    const verified = await this.tokenService.validateAccessToken(token);
    const exp = typeof verified.payload.exp === 'number' ? verified.payload.exp : 0;
    const iat = typeof verified.payload.iat === 'number' ? verified.payload.iat : 0;
    return {
      subject: verified.sub,
      clientId: verified.clientId,
      scope: verified.scope,
      consentId: verified.consentId ?? null,
      institutionId: verified.institutionId ?? null,
      userId: verified.userId ?? null,
      jti: verified.jti,
      expiresAtEpoch: exp,
      issuedAtEpoch: iat,
    };
  }
}
