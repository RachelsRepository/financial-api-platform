import { beforeAll, describe, expect, it } from 'vitest';
import { exportJWK, generateKeyPair, type JWK } from 'jose';
import { TokenService } from '../../../src/infrastructure/identity/token.service';

describe('TokenService', () => {
  let privateJwk: JWK;
  const issuer = 'https://auth.example.test';
  const audience = 'financial-api';

  beforeAll(async () => {
    const { privateKey } = await generateKeyPair('ES256');
    const exported = await exportJWK(privateKey);
    privateJwk = { ...exported, kid: 'test-key-1', alg: 'ES256', use: 'sig' };
  });

  async function createService(): Promise<TokenService> {
    const service = new TokenService({
      issuer,
      audience,
      accessTokenTtlSeconds: 300,
      clockSkewSeconds: 30,
      activeKid: 'test-key-1',
      privateJwk: privateJwk,
    });
    await service.initialize();
    return service;
  }

  it('issues and validates access tokens', async () => {
    const service = await createService();
    const issued = await service.issueAccessToken({
      sub: 'user-1',
      clientId: 'demo-client',
      scope: 'accounts:read openid',
      consentId: 'consent-1',
      institutionId: 'inst-1',
      userId: 'user-1',
    });

    expect(issued.jti).toBeTruthy();
    expect(issued.expiresInSeconds).toBe(300);

    const verified = await service.validateAccessToken(issued.accessToken);
    expect(verified.clientId).toBe('demo-client');
    expect(verified.scope).toContain('accounts:read');
    expect(verified.jti).toBe(issued.jti);
  });

  it('rejects wrong audience', async () => {
    const service = await createService();
    const issued = await service.issueAccessToken({
      sub: 'user-1',
      clientId: 'demo-client',
      scope: 'accounts:read',
    });

    const wrongAudienceService = new TokenService({
      issuer,
      audience: 'other-audience',
      accessTokenTtlSeconds: 300,
      clockSkewSeconds: 30,
      activeKid: 'test-key-1',
      privateJwk: privateJwk,
    });
    await wrongAudienceService.initialize();

    await expect(wrongAudienceService.validateAccessToken(issued.accessToken)).rejects.toThrow();
  });

  it('rejects wrong issuer', async () => {
    const service = await createService();
    const issued = await service.issueAccessToken({
      sub: 'user-1',
      clientId: 'demo-client',
      scope: 'accounts:read',
    });

    const wrongIssuerService = new TokenService({
      issuer: 'https://other-issuer.example.test',
      audience,
      accessTokenTtlSeconds: 300,
      clockSkewSeconds: 30,
      activeKid: 'test-key-1',
      privateJwk: privateJwk,
    });
    await wrongIssuerService.initialize();

    await expect(wrongIssuerService.validateAccessToken(issued.accessToken)).rejects.toThrow();
  });
});
