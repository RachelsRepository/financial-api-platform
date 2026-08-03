import { describe, expect, it } from 'vitest';
import { rejectProductionMisconfiguration } from '../../../src/infrastructure/security/production-guard';

describe('production guard', () => {
  it('allows development configuration', () => {
    expect(() =>
      rejectProductionMisconfiguration({
        nodeEnv: 'development',
        enableProviderSandbox: true,
        enableSwagger: true,
        mtlsRequired: false,
        jwtPrivateJwk: '{"kty":"EC"}',
        jwtActiveKid: 'dev-key-1',
        databaseUrl: 'postgresql://localhost:5432/db',
        redisUrl: 'redis://localhost:6379',
      }),
    ).not.toThrow();
  });

  it('rejects sandbox and swagger in production', () => {
    expect(() =>
      rejectProductionMisconfiguration({
        nodeEnv: 'production',
        enableProviderSandbox: true,
        enableSwagger: false,
        mtlsRequired: true,
        jwtPrivateJwk: '{"kty":"EC","d":"real"}',
        jwtActiveKid: 'prod-key-1',
        databaseUrl: 'postgresql://db.prod.example.test:5432/fap',
        redisUrl: 'redis://cache.prod.example.test:6379',
        tokenIssuer: 'https://auth.prod.example.test',
        trustedHosts: 'api.prod.example.test',
      }),
    ).toThrow(/ENABLE_PROVIDER_SANDBOX/);
  });

  it('requires HTTPS issuer and disallows localhost trusted hosts in production', () => {
    expect(() =>
      rejectProductionMisconfiguration({
        nodeEnv: 'production',
        enableProviderSandbox: false,
        enableSwagger: false,
        mtlsRequired: true,
        jwtPrivateJwk: '{"kty":"EC","d":"real"}',
        jwtActiveKid: 'prod-key-1',
        databaseUrl: 'postgresql://db.prod.example.test:5432/fap',
        redisUrl: 'redis://cache.prod.example.test:6379',
        tokenIssuer: 'http://auth.prod.example.test',
        trustedHosts: 'localhost',
      }),
    ).toThrow(/TOKEN_ISSUER must use HTTPS/);
  });
});
