import {
  SignJWT,
  jwtVerify,
  exportJWK,
  generateKeyPair,
  createRemoteJWKSet,
  importJWK,
  decodeProtectedHeader,
  type JWK,
  type JWTPayload,
  type KeyLike,
} from 'jose';
import { randomUUID } from 'node:crypto';

export interface TokenServiceConfig {
  readonly issuer: string;
  readonly audience: string;
  readonly accessTokenTtlSeconds: number;
  readonly clockSkewSeconds: number;
  readonly activeKid: string;
  readonly privateJwk?: JWK;
  readonly additionalPublicJwks?: readonly JWK[];
}

export interface AccessTokenClaims {
  readonly sub: string;
  readonly clientId: string;
  readonly scope: string;
  readonly consentId?: string;
  readonly institutionId?: string;
  readonly userId?: string;
}

export interface IdTokenClaims extends AccessTokenClaims {
  readonly nonce?: string;
}

export interface VerifiedAccessToken {
  readonly payload: JWTPayload;
  readonly sub: string;
  readonly clientId: string;
  readonly scope: string;
  readonly consentId?: string;
  readonly institutionId?: string;
  readonly userId?: string;
  readonly jti: string;
}

export interface SigningKeyEntry {
  readonly kid: string;
  readonly privateKey: KeyLike;
  readonly publicKey: KeyLike;
  readonly publicJwk: JWK;
}

function hasOpenIdScope(scope: string): boolean {
  return scope.split(/\s+/).includes('openid');
}

function parseOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export class TokenService {
  private readonly keys = new Map<string, SigningKeyEntry>();
  private activeKid: string;

  constructor(private readonly config: TokenServiceConfig) {
    this.activeKid = config.activeKid;
  }

  async initialize(): Promise<void> {
    if (this.config.privateJwk) {
      await this.importKeyPair(this.config.privateJwk);
    } else {
      await this.rotateKeys(this.config.activeKid);
    }

    for (const jwk of this.config.additionalPublicJwks ?? []) {
      if (jwk.kid && !this.keys.has(jwk.kid)) {
        await this.importPublicKeyOnly(jwk);
      }
    }
  }

  async rotateKeys(kid?: string): Promise<string> {
    const nextKid = kid ?? `key-${randomUUID()}`;
    const { privateKey, publicKey } = await generateKeyPair('ES256');
    const publicJwk = await exportJWK(publicKey);
    publicJwk.kid = nextKid;
    publicJwk.alg = 'ES256';
    publicJwk.use = 'sig';

    this.keys.set(nextKid, {
      kid: nextKid,
      privateKey,
      publicKey,
      publicJwk,
    });
    this.activeKid = nextKid;
    return nextKid;
  }

  setActiveKid(kid: string): void {
    if (!this.keys.has(kid)) {
      throw new Error(`Unknown signing key kid: ${kid}`);
    }
    this.activeKid = kid;
  }

  getActiveKid(): string {
    return this.activeKid;
  }

  async issueAccessToken(
    claims: AccessTokenClaims,
  ): Promise<{ accessToken: string; jti: string; expiresInSeconds: number }> {
    const key = this.requireActiveSigningKey();
    const now = Math.floor(Date.now() / 1000);
    const jti = randomUUID();
    const expiresInSeconds = this.config.accessTokenTtlSeconds;

    const builder = new SignJWT({
      scope: claims.scope,
      client_id: claims.clientId,
      consent_id: claims.consentId,
      institution_id: claims.institutionId,
      user_id: claims.userId,
    })
      .setProtectedHeader({ alg: 'ES256', kid: key.kid })
      .setSubject(claims.sub)
      .setIssuer(this.config.issuer)
      .setAudience(this.config.audience)
      .setJti(jti)
      .setIssuedAt(now)
      .setExpirationTime(now + expiresInSeconds);

    const accessToken = await builder.sign(key.privateKey);
    return { accessToken, jti, expiresInSeconds };
  }

  async issueIdToken(claims: IdTokenClaims): Promise<string> {
    if (!hasOpenIdScope(claims.scope)) {
      throw new Error('ID token requires openid scope');
    }

    const key = this.requireActiveSigningKey();
    const now = Math.floor(Date.now() / 1000);

    const payload: Record<string, string> = {
      scope: claims.scope,
      client_id: claims.clientId,
    };
    if (claims.consentId) {
      payload.consent_id = claims.consentId;
    }
    if (claims.institutionId) {
      payload.institution_id = claims.institutionId;
    }
    if (claims.userId) {
      payload.user_id = claims.userId;
    }
    if (claims.nonce && claims.nonce.length > 0) {
      payload.nonce = claims.nonce;
    }

    const builder = new SignJWT(payload)
      .setProtectedHeader({ alg: 'ES256', kid: key.kid })
      .setSubject(claims.sub)
      .setIssuer(this.config.issuer)
      .setAudience(claims.clientId)
      .setJti(randomUUID())
      .setIssuedAt(now)
      .setExpirationTime(now + this.config.accessTokenTtlSeconds);

    return builder.sign(key.privateKey);
  }

  async validateAccessToken(token: string): Promise<VerifiedAccessToken> {
    const header = decodeProtectedHeader(token);
    const kid = header.kid;
    if (!kid) {
      throw new Error('Access token missing kid header');
    }

    const key = this.keys.get(kid);
    if (!key?.publicKey) {
      throw new Error(`Unknown signing key kid: ${kid}`);
    }

    const { payload } = await jwtVerify(token, key.publicKey, {
      issuer: this.config.issuer,
      audience: this.config.audience,
      clockTolerance: this.config.clockSkewSeconds,
      algorithms: ['ES256'],
    });

    const sub = payload.sub;
    const clientId = parseOptionalString(payload.client_id);
    const scope = parseOptionalString(payload.scope);
    const jti = parseOptionalString(payload.jti);

    if (!sub || !clientId || !scope || !jti) {
      throw new Error('Access token missing required claims');
    }

    return {
      payload,
      sub,
      clientId,
      scope,
      consentId: parseOptionalString(payload.consent_id),
      institutionId: parseOptionalString(payload.institution_id),
      userId: parseOptionalString(payload.user_id),
      jti,
    };
  }

  exportJwks(): Promise<{ keys: JWK[] }> {
    const keys = [...this.keys.values()].map((entry) => entry.publicJwk);
    return Promise.resolve({ keys });
  }

  createRemoteVerifier(jwksUri: string): ReturnType<typeof createRemoteJWKSet> {
    return createRemoteJWKSet(new URL(jwksUri));
  }

  private requireActiveSigningKey(): SigningKeyEntry {
    const key = this.keys.get(this.activeKid);
    if (!key?.privateKey) {
      throw new Error(`Active signing key not available for kid: ${this.activeKid}`);
    }
    return key;
  }

  private async importKeyPair(jwk: JWK): Promise<void> {
    const kid = jwk.kid;
    if (!kid) {
      throw new Error('Private JWK must include kid');
    }

    const privateKey = await importJWK(jwk, 'ES256');
    const publicJwk = { ...jwk };
    delete publicJwk.d;

    const publicKey = await importJWK(publicJwk, 'ES256');

    this.keys.set(kid, {
      kid,
      privateKey: privateKey as KeyLike,
      publicKey: publicKey as KeyLike,
      publicJwk: {
        ...publicJwk,
        use: 'sig',
        alg: 'ES256',
      },
    });
  }

  private async importPublicKeyOnly(jwk: JWK): Promise<void> {
    const kid = jwk.kid;
    if (!kid) {
      throw new Error('Public JWK must include kid');
    }

    const publicJwk = { ...jwk, use: 'sig' as const, alg: 'ES256' as const };
    delete publicJwk.d;
    const publicKey = await importJWK(publicJwk, 'ES256');

    this.keys.set(kid, {
      kid,
      privateKey: null as unknown as KeyLike,
      publicKey: publicKey as KeyLike,
      publicJwk,
    });
  }
}
