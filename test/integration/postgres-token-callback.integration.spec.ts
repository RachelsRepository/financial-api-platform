import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import { execSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { exportJWK, generateKeyPair } from 'jose';
import { Consent, Payment } from '../../src/domain/entities';
import { Money, SCOPES, ScopeSet } from '../../src/domain/value-objects';
import { PaymentStatus } from '../../src/domain/policies/state-machines';
import { TokenReuseDetectedError } from '../../src/domain/errors';
import { ExchangeAuthorizationCodeUseCase } from '../../src/application/use-cases/identity/exchange-authorization-code.use-case';
import { RefreshTokensUseCase } from '../../src/application/use-cases/identity/refresh-tokens.use-case';
import { ProcessProviderCallbackUseCase } from '../../src/application/use-cases/payments/process-provider-callback.use-case';
import { AccessTokenIssuerAdapter } from '../../src/infrastructure/identity/access-token-issuer.adapter';
import { CryptoAdapter } from '../../src/infrastructure/identity/crypto.adapter';
import { SystemClock } from '../../src/infrastructure/identity/system-clock';
import { TokenService } from '../../src/infrastructure/identity/token.service';
import { UuidIdGenerator } from '../../src/infrastructure/identity/uuid-id-generator';
import { PrismaAuditRepository } from '../../src/infrastructure/persistence/prisma/audit.repository';
import { PrismaClientRepository } from '../../src/infrastructure/persistence/prisma/client.repository';
import { PrismaConsentRepository } from '../../src/infrastructure/persistence/prisma/consent.repository';
import { PrismaPaymentRepository } from '../../src/infrastructure/persistence/prisma/payment.repository';
import { PrismaProviderCallbackRepository } from '../../src/infrastructure/persistence/prisma/provider-callback.repository';
import { PrismaService } from '../../src/infrastructure/persistence/prisma/prisma.service';
import { PrismaTokenRepository } from '../../src/infrastructure/persistence/prisma/token.repository';
import { PrismaUnitOfWork } from '../../src/infrastructure/persistence/prisma/unit-of-work';

const IDS = {
  institution: '11111111-1111-4111-8111-111111111111',
  client: '44444444-4444-4444-8444-444444444444',
  user: '55555555-5555-4555-8555-555555555555',
  account: '66666666-6666-4666-8666-666666666666',
};

describe('Database integration (Postgres testcontainer)', () => {
  let container: StartedTestContainer;
  let prisma: PrismaService;
  let databaseUrl: string;

  beforeAll(async () => {
    container = await new GenericContainer('postgres:16-alpine')
      .withEnvironment({
        POSTGRES_USER: 'fap',
        POSTGRES_PASSWORD: 'fap_test',
        POSTGRES_DB: 'financial_api',
      })
      .withExposedPorts(5432)
      .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/))
      .start();

    const host = container.getHost();
    const port = container.getMappedPort(5432);
    databaseUrl = `postgresql://fap:fap_test@${host}:${port}/financial_api?schema=public`;
    process.env.DATABASE_URL = databaseUrl;

    execSync('pnpm prisma migrate deploy', {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'pipe',
    });
    execSync('pnpm exec prisma db seed', {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'pipe',
    });

    prisma = new PrismaService();
    await prisma.$connect();
  }, 180_000);

  afterAll(async () => {
    await prisma.$disconnect();
    await container.stop();
  });

  it('enforces authorization-code single use and JWT exchange against real persistence', async () => {
    const { privateKey } = await generateKeyPair('ES256');
    const privateJwk = await exportJWK(privateKey);
    privateJwk.kid = 'int-key';
    privateJwk.alg = 'ES256';
    privateJwk.use = 'sig';
    const tokenService = new TokenService({
      issuer: 'https://auth.example.test',
      audience: 'financial-api',
      accessTokenTtlSeconds: 300,
      clockSkewSeconds: 30,
      activeKid: 'int-key',
      privateJwk,
    });
    await tokenService.initialize();

    const tokenRepository = new PrismaTokenRepository(prisma);
    const consentRepository = new PrismaConsentRepository(prisma);
    const clientRepository = new PrismaClientRepository(prisma);
    const unitOfWork = new PrismaUnitOfWork(prisma);
    const crypto = new CryptoAdapter();
    const clock = new SystemClock();
    const ids = new UuidIdGenerator();
    const audit = new PrismaAuditRepository(prisma);

    const now = clock.now();
    const consent = Consent.create({
      id: ids.generate(),
      userId: IDS.user,
      clientId: IDS.client,
      institutionId: IDS.institution,
      requestedScopes: ScopeSet.fromString(
        `${SCOPES.ACCOUNTS_READ} ${SCOPES.PAYMENTS_WRITE} ${SCOPES.OPENID} ${SCOPES.OFFLINE_ACCESS}`,
      ),
      purpose: 'integration',
      expiresAt: new Date(now.getTime() + 86_400_000),
      now,
    });
    consent.submitForAuthorization(now);
    consent.authorize({
      accountIds: [IDS.account],
      grantedScopes: consent.requestedScopes,
      now,
    });
    await consentRepository.save(consent);

    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const code = ids.generate();
    await tokenRepository.saveAuthorizationCode({
      code,
      clientId: IDS.client,
      userId: IDS.user,
      consentId: consent.id,
      redirectUri: 'https://localhost:3001/oauth/callback',
      scopes: consent.grantedScopes ?? ScopeSet.empty(),
      codeChallenge: challenge,
      codeChallengeMethod: 'S256',
      nonce: 'n-1',
      expiresAt: new Date(now.getTime() + 600_000),
      usedAt: null,
      createdAt: now,
    });

    const exchange = new ExchangeAuthorizationCodeUseCase(
      unitOfWork,
      clientRepository,
      consentRepository,
      tokenRepository,
      new AccessTokenIssuerAdapter(tokenService),
      crypto,
      clock,
      ids,
      audit,
    );

    const tokens = await exchange.execute({
      clientId: 'fap-demo-client',
      clientSecret: 'demo-client-secret-change-me',
      code,
      redirectUri: 'https://localhost:3001/oauth/callback',
      codeVerifier: verifier,
    });

    expect(tokens.accessToken.split('.')).toHaveLength(3);
    expect(tokens.idToken).toBeTruthy();
    const verified = await tokenService.validateAccessToken(tokens.accessToken);
    const record = await tokenRepository.findAccessTokenByJti(verified.jti);
    expect(record?.revokedAt).toBeNull();

    await expect(
      exchange.execute({
        clientId: 'fap-demo-client',
        clientSecret: 'demo-client-secret-change-me',
        code,
        redirectUri: 'https://localhost:3001/oauth/callback',
        codeVerifier: verifier,
      }),
    ).rejects.toThrow(/already used/);

    const refresh = new RefreshTokensUseCase(
      unitOfWork,
      clientRepository,
      consentRepository,
      tokenRepository,
      new AccessTokenIssuerAdapter(tokenService),
      crypto,
      clock,
      ids,
      audit,
    );
    const rotated = await refresh.execute({
      clientId: 'fap-demo-client',
      clientSecret: 'demo-client-secret-change-me',
      refreshToken: tokens.refreshToken as string,
    });
    expect(rotated.accessToken).toBeTruthy();

    await expect(
      refresh.execute({
        clientId: 'fap-demo-client',
        clientSecret: 'demo-client-secret-change-me',
        refreshToken: tokens.refreshToken as string,
      }),
    ).rejects.toThrow(TokenReuseDetectedError);

    const outboxCount = await prisma.outboxEvent.count({
      where: { aggregateId: consent.id },
    });
    expect(outboxCount).toBeGreaterThan(0);
  });

  it('persists callback receipts and blocks replay side effects', async () => {
    const paymentRepository = new PrismaPaymentRepository(prisma);
    const callbackRepository = new PrismaProviderCallbackRepository(prisma);
    const unitOfWork = new PrismaUnitOfWork(prisma);
    const clock = new SystemClock();
    const ids = new UuidIdGenerator();
    const crypto = new CryptoAdapter();
    const now = clock.now();

    const consentId = (
      await prisma.consent.findFirst({
        where: { userId: IDS.user },
        orderBy: { createdAt: 'desc' },
      })
    )?.id;
    expect(consentId).toBeTruthy();

    const payment = Payment.create({
      id: ids.generate(),
      consentId: consentId as string,
      clientId: IDS.client,
      institutionId: IDS.institution,
      userId: IDS.user,
      sourceAccountId: IDS.account,
      amount: Money.of(2200, 'USD'),
      creditorName: 'Integration Creditor',
      creditorAccountRef: 'US00DEMO9999',
      reference: 'INT-1',
      providerCode: 'sandbox',
      idempotencyKey: `int-${Date.now()}`,
      now,
    });
    payment.requestAuthorization(now);
    payment.authorize(now);
    payment.submit('sbx_integration_payment_1', now);
    await paymentRepository.save(payment);

    const useCase = new ProcessProviderCallbackUseCase(
      unitOfWork,
      paymentRepository,
      callbackRepository,
      {
        verifyWebhook: async () => ({
          valid: true,
          eventId: 'evt-integration-1',
          providerPaymentId: 'sbx_integration_payment_1',
          normalizedStatus: 'completed',
          reason: null,
        }),
        submitPayment: async () => {
          throw new Error('unused');
        },
        getPaymentStatus: async () => {
          throw new Error('unused');
        },
      },
      crypto,
      clock,
      ids,
    );

    const first = await useCase.execute({
      providerCode: 'sandbox',
      headers: { 'x-sandbox-token': 'sandbox-local' },
      body: JSON.stringify({
        eventId: 'evt-integration-1',
        paymentId: 'sbx_integration_payment_1',
        status: 'completed',
      }),
    });
    expect(first.processed).toBe(true);
    expect(first.status).toBe(PaymentStatus.SETTLED);

    const second = await useCase.execute({
      providerCode: 'sandbox',
      headers: { 'x-sandbox-token': 'sandbox-local' },
      body: JSON.stringify({
        eventId: 'evt-integration-1',
        paymentId: 'sbx_integration_payment_1',
        status: 'completed',
      }),
    });
    expect(second.processed).toBe(false);
    expect(second.status).toBe('duplicate');

    const callbacks = await prisma.providerCallback.count({
      where: { providerEventId: 'evt-integration-1' },
    });
    expect(callbacks).toBe(1);

    const reloaded = await paymentRepository.findById(payment.id);
    expect(reloaded?.status).toBe(PaymentStatus.SETTLED);
  });
});
