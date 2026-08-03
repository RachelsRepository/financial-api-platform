import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { type JWK } from 'jose';
import { TOKENS } from '@application/ports/tokens';
import { AuthorizationDecisionService } from '@application/services/authorization-decision.service';
import {
  ActivateConsentUseCase,
  AuthorizeConsentUseCase,
  CreateConsentUseCase,
  ExpireConsentsUseCase,
  GetConsentUseCase,
  RevokeConsentUseCase,
} from '@application/use-cases/consents';
import {
  GetAccountUseCase,
  GetBalancesUseCase,
  ListAccountsUseCase,
  ListBeneficiariesUseCase,
  ListTransactionsUseCase,
} from '@application/use-cases/accounts';
import {
  AuthorizePaymentUseCase,
  CancelPaymentUseCase,
  CreatePaymentUseCase,
  GetPaymentUseCase,
  ProcessProviderCallbackUseCase,
  SubmitPaymentUseCase,
} from '@application/use-cases/payments';
import {
  CreateAuthorizationRequestUseCase,
  ExchangeAuthorizationCodeUseCase,
  IntrospectTokenUseCase,
  RefreshTokensUseCase,
  RevokeTokenUseCase,
} from '@application/use-cases/identity';
import { ListInstitutionsUseCase } from '@application/use-cases/institutions';
import { CONFIG_KEY, type AppConfig } from '@config/configuration';
import { RedisService } from './cache/redis/redis.service';
import { AccessTokenIssuerAdapter } from './identity/access-token-issuer.adapter';
import { AccessTokenValidatorAdapter } from './identity/access-token-validator.adapter';
import { CryptoAdapter } from './identity/crypto.adapter';
import { SystemClock } from './identity/system-clock';
import { TokenService } from './identity/token.service';
import { UuidIdGenerator } from './identity/uuid-id-generator';
import { KafkaPublisher } from './messaging/kafka/kafka.publisher';
import { OutboxPublisherService } from './messaging/kafka/outbox.publisher.service';
import { PrismaAccountRepository } from './persistence/prisma/account.repository';
import { PrismaAuditRepository } from './persistence/prisma/audit.repository';
import { PrismaClientRepository } from './persistence/prisma/client.repository';
import { PrismaConsentRepository } from './persistence/prisma/consent.repository';
import { PrismaInstitutionRepository } from './persistence/prisma/institution.repository';
import { PrismaOutboxService } from './persistence/prisma/outbox.service';
import { PrismaPaymentRepository } from './persistence/prisma/payment.repository';
import { PrismaModule } from './persistence/prisma/prisma.module';
import { PrismaProviderCallbackRepository } from './persistence/prisma/provider-callback.repository';
import { PrismaTokenRepository } from './persistence/prisma/token.repository';
import { PrismaUnitOfWork } from './persistence/prisma/unit-of-work';
import { FinancialProviderAdapter } from './providers/financial-provider.adapter';
import { createDefaultProviderRegistry, ProviderRegistry } from './providers/provider.registry';
import { PaymentReconciliationService } from './payments/payment-reconciliation.service';
import { DependencyHealthIndicator } from './health/dependency-health.indicator';

const PORT_PROVIDERS = [
  { provide: TOKENS.CONSENT_REPOSITORY, useClass: PrismaConsentRepository },
  { provide: TOKENS.PAYMENT_REPOSITORY, useClass: PrismaPaymentRepository },
  { provide: TOKENS.ACCOUNT_REPOSITORY, useClass: PrismaAccountRepository },
  { provide: TOKENS.CLIENT_REPOSITORY, useClass: PrismaClientRepository },
  { provide: TOKENS.INSTITUTION_REPOSITORY, useClass: PrismaInstitutionRepository },
  { provide: TOKENS.TOKEN_REPOSITORY, useClass: PrismaTokenRepository },
  { provide: TOKENS.PROVIDER_CALLBACK_REPOSITORY, useClass: PrismaProviderCallbackRepository },
  { provide: TOKENS.OUTBOX_PORT, useClass: PrismaOutboxService },
  { provide: TOKENS.AUDIT_PORT, useClass: PrismaAuditRepository },
  { provide: TOKENS.CLOCK_PORT, useClass: SystemClock },
  { provide: TOKENS.ID_GENERATOR_PORT, useClass: UuidIdGenerator },
  { provide: TOKENS.CRYPTO_PORT, useClass: CryptoAdapter },
  { provide: TOKENS.UNIT_OF_WORK_PORT, useClass: PrismaUnitOfWork },
] as const;

@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [
    ...PORT_PROVIDERS,
    KafkaPublisher,
    {
      provide: TOKENS.EVENT_PUBLISHER_PORT,
      useExisting: KafkaPublisher,
    },
    RedisService,
    OutboxPublisherService,
    PaymentReconciliationService,
    DependencyHealthIndicator,
    {
      provide: TOKENS.OUTBOX_PUBLISHER,
      useExisting: OutboxPublisherService,
    },
    {
      provide: TOKENS.PAYMENT_RECONCILIATION,
      useExisting: PaymentReconciliationService,
    },
    {
      provide: TOKENS.TOKEN_SERVICE,
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const config = configService.getOrThrow<AppConfig>(CONFIG_KEY);
        let privateJwk: JWK | undefined;
        if (config.JWT_PRIVATE_JWK) {
          privateJwk = JSON.parse(config.JWT_PRIVATE_JWK) as JWK;
        }
        let additionalPublicJwks: JWK[] = [];
        if (config.JWT_PUBLIC_JWKS) {
          const parsed = JSON.parse(config.JWT_PUBLIC_JWKS) as { keys?: JWK[] };
          additionalPublicJwks = parsed.keys ?? [];
        }
        const service = new TokenService({
          issuer: config.TOKEN_ISSUER,
          audience: config.TOKEN_AUDIENCE,
          accessTokenTtlSeconds: config.ACCESS_TOKEN_TTL_SECONDS,
          clockSkewSeconds: config.CLOCK_SKEW_SECONDS,
          activeKid: config.JWT_ACTIVE_KID,
          privateJwk,
          additionalPublicJwks,
        });
        await service.initialize();
        return service;
      },
    },
    {
      provide: TOKENS.ACCESS_TOKEN_ISSUER_PORT,
      inject: [TOKENS.TOKEN_SERVICE],
      useFactory: (tokenService: TokenService) => new AccessTokenIssuerAdapter(tokenService),
    },
    {
      provide: TOKENS.ACCESS_TOKEN_VALIDATOR_PORT,
      inject: [TOKENS.TOKEN_SERVICE],
      useFactory: (tokenService: TokenService) => new AccessTokenValidatorAdapter(tokenService),
    },
    {
      provide: ProviderRegistry,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const config = configService.getOrThrow<AppConfig>(CONFIG_KEY);
        return createDefaultProviderRegistry({
          enableSandbox: config.ENABLE_PROVIDER_SANDBOX,
          northstar: {
            apiKey: 'northstar-dev-api-key',
            webhookSecret: 'northstar-dev-webhook-secret',
            baseUrl: 'https://northstar.example.test',
          },
          meridian: {
            clientId: 'meridian-dev-client',
            clientSecret: 'meridian-dev-secret',
            webhookSecret: 'meridian-dev-webhook-secret',
            tokenUrl: 'https://meridian.example.test/oauth/token',
          },
          cobalt: {
            signingKey: 'cobalt-dev-signing-key',
            callbackSecret: 'cobalt-dev-callback-secret',
          },
        });
      },
    },
    FinancialProviderAdapter,
    {
      provide: TOKENS.FINANCIAL_PROVIDER_PORT,
      useExisting: FinancialProviderAdapter,
    },
    {
      provide: AuthorizationDecisionService,
      useFactory: (clientRepository: PrismaClientRepository) =>
        new AuthorizationDecisionService(clientRepository),
      inject: [TOKENS.CLIENT_REPOSITORY],
    },
    {
      provide: CreateConsentUseCase,
      useFactory: (
        unitOfWork: PrismaUnitOfWork,
        consentRepository: PrismaConsentRepository,
        clock: SystemClock,
        idGenerator: UuidIdGenerator,
        audit: PrismaAuditRepository,
      ) => new CreateConsentUseCase(unitOfWork, consentRepository, clock, idGenerator, audit),
      inject: [
        TOKENS.UNIT_OF_WORK_PORT,
        TOKENS.CONSENT_REPOSITORY,
        TOKENS.CLOCK_PORT,
        TOKENS.ID_GENERATOR_PORT,
        TOKENS.AUDIT_PORT,
      ],
    },
    {
      provide: AuthorizeConsentUseCase,
      useFactory: (
        unitOfWork: PrismaUnitOfWork,
        consentRepository: PrismaConsentRepository,
        tokenRepository: PrismaTokenRepository,
        clock: SystemClock,
        idGenerator: UuidIdGenerator,
        audit: PrismaAuditRepository,
      ) =>
        new AuthorizeConsentUseCase(
          unitOfWork,
          consentRepository,
          tokenRepository,
          clock,
          idGenerator,
          audit,
        ),
      inject: [
        TOKENS.UNIT_OF_WORK_PORT,
        TOKENS.CONSENT_REPOSITORY,
        TOKENS.TOKEN_REPOSITORY,
        TOKENS.CLOCK_PORT,
        TOKENS.ID_GENERATOR_PORT,
        TOKENS.AUDIT_PORT,
      ],
    },
    {
      provide: ActivateConsentUseCase,
      useFactory: (
        unitOfWork: PrismaUnitOfWork,
        consentRepository: PrismaConsentRepository,
        clock: SystemClock,
        idGenerator: UuidIdGenerator,
        audit: PrismaAuditRepository,
      ) => new ActivateConsentUseCase(unitOfWork, consentRepository, clock, idGenerator, audit),
      inject: [
        TOKENS.UNIT_OF_WORK_PORT,
        TOKENS.CONSENT_REPOSITORY,
        TOKENS.CLOCK_PORT,
        TOKENS.ID_GENERATOR_PORT,
        TOKENS.AUDIT_PORT,
      ],
    },
    {
      provide: RevokeConsentUseCase,
      useFactory: (
        unitOfWork: PrismaUnitOfWork,
        consentRepository: PrismaConsentRepository,
        tokenRepository: PrismaTokenRepository,
        clock: SystemClock,
        idGenerator: UuidIdGenerator,
        audit: PrismaAuditRepository,
      ) =>
        new RevokeConsentUseCase(
          unitOfWork,
          consentRepository,
          tokenRepository,
          clock,
          idGenerator,
          audit,
        ),
      inject: [
        TOKENS.UNIT_OF_WORK_PORT,
        TOKENS.CONSENT_REPOSITORY,
        TOKENS.TOKEN_REPOSITORY,
        TOKENS.CLOCK_PORT,
        TOKENS.ID_GENERATOR_PORT,
        TOKENS.AUDIT_PORT,
      ],
    },
    {
      provide: ExpireConsentsUseCase,
      useFactory: (
        unitOfWork: PrismaUnitOfWork,
        consentRepository: PrismaConsentRepository,
        clock: SystemClock,
        idGenerator: UuidIdGenerator,
      ) => new ExpireConsentsUseCase(unitOfWork, consentRepository, clock, idGenerator),
      inject: [
        TOKENS.UNIT_OF_WORK_PORT,
        TOKENS.CONSENT_REPOSITORY,
        TOKENS.CLOCK_PORT,
        TOKENS.ID_GENERATOR_PORT,
      ],
    },
    {
      provide: GetConsentUseCase,
      useFactory: (
        consentRepository: PrismaConsentRepository,
        clientRepository: PrismaClientRepository,
      ) => new GetConsentUseCase(consentRepository, clientRepository),
      inject: [TOKENS.CONSENT_REPOSITORY, TOKENS.CLIENT_REPOSITORY],
    },
    {
      provide: ListAccountsUseCase,
      useFactory: (
        consentRepository: PrismaConsentRepository,
        accountRepository: PrismaAccountRepository,
        authorizationDecision: AuthorizationDecisionService,
      ) => new ListAccountsUseCase(consentRepository, accountRepository, authorizationDecision),
      inject: [TOKENS.CONSENT_REPOSITORY, TOKENS.ACCOUNT_REPOSITORY, AuthorizationDecisionService],
    },
    {
      provide: GetAccountUseCase,
      useFactory: (
        consentRepository: PrismaConsentRepository,
        accountRepository: PrismaAccountRepository,
        authorizationDecision: AuthorizationDecisionService,
      ) => new GetAccountUseCase(consentRepository, accountRepository, authorizationDecision),
      inject: [TOKENS.CONSENT_REPOSITORY, TOKENS.ACCOUNT_REPOSITORY, AuthorizationDecisionService],
    },
    {
      provide: GetBalancesUseCase,
      useFactory: (
        consentRepository: PrismaConsentRepository,
        accountRepository: PrismaAccountRepository,
        authorizationDecision: AuthorizationDecisionService,
      ) => new GetBalancesUseCase(consentRepository, accountRepository, authorizationDecision),
      inject: [TOKENS.CONSENT_REPOSITORY, TOKENS.ACCOUNT_REPOSITORY, AuthorizationDecisionService],
    },
    {
      provide: ListTransactionsUseCase,
      useFactory: (
        consentRepository: PrismaConsentRepository,
        accountRepository: PrismaAccountRepository,
        authorizationDecision: AuthorizationDecisionService,
      ) => new ListTransactionsUseCase(consentRepository, accountRepository, authorizationDecision),
      inject: [TOKENS.CONSENT_REPOSITORY, TOKENS.ACCOUNT_REPOSITORY, AuthorizationDecisionService],
    },
    {
      provide: ListBeneficiariesUseCase,
      useFactory: (
        consentRepository: PrismaConsentRepository,
        accountRepository: PrismaAccountRepository,
        authorizationDecision: AuthorizationDecisionService,
      ) =>
        new ListBeneficiariesUseCase(consentRepository, accountRepository, authorizationDecision),
      inject: [TOKENS.CONSENT_REPOSITORY, TOKENS.ACCOUNT_REPOSITORY, AuthorizationDecisionService],
    },
    {
      provide: CreatePaymentUseCase,
      useFactory: (
        unitOfWork: PrismaUnitOfWork,
        consentRepository: PrismaConsentRepository,
        paymentRepository: PrismaPaymentRepository,
        institutionRepository: PrismaInstitutionRepository,
        authorizationDecision: AuthorizationDecisionService,
        clock: SystemClock,
        idGenerator: UuidIdGenerator,
        audit: PrismaAuditRepository,
      ) =>
        new CreatePaymentUseCase(
          unitOfWork,
          consentRepository,
          paymentRepository,
          institutionRepository,
          authorizationDecision,
          clock,
          idGenerator,
          audit,
        ),
      inject: [
        TOKENS.UNIT_OF_WORK_PORT,
        TOKENS.CONSENT_REPOSITORY,
        TOKENS.PAYMENT_REPOSITORY,
        TOKENS.INSTITUTION_REPOSITORY,
        AuthorizationDecisionService,
        TOKENS.CLOCK_PORT,
        TOKENS.ID_GENERATOR_PORT,
        TOKENS.AUDIT_PORT,
      ],
    },
    {
      provide: AuthorizePaymentUseCase,
      useFactory: (
        unitOfWork: PrismaUnitOfWork,
        paymentRepository: PrismaPaymentRepository,
        clock: SystemClock,
        idGenerator: UuidIdGenerator,
        audit: PrismaAuditRepository,
      ) => new AuthorizePaymentUseCase(unitOfWork, paymentRepository, clock, idGenerator, audit),
      inject: [
        TOKENS.UNIT_OF_WORK_PORT,
        TOKENS.PAYMENT_REPOSITORY,
        TOKENS.CLOCK_PORT,
        TOKENS.ID_GENERATOR_PORT,
        TOKENS.AUDIT_PORT,
      ],
    },
    {
      provide: SubmitPaymentUseCase,
      useFactory: (
        unitOfWork: PrismaUnitOfWork,
        paymentRepository: PrismaPaymentRepository,
        clientRepository: PrismaClientRepository,
        institutionRepository: PrismaInstitutionRepository,
        provider: FinancialProviderAdapter,
        clock: SystemClock,
        idGenerator: UuidIdGenerator,
        audit: PrismaAuditRepository,
      ) =>
        new SubmitPaymentUseCase(
          unitOfWork,
          paymentRepository,
          clientRepository,
          institutionRepository,
          provider,
          clock,
          idGenerator,
          audit,
        ),
      inject: [
        TOKENS.UNIT_OF_WORK_PORT,
        TOKENS.PAYMENT_REPOSITORY,
        TOKENS.CLIENT_REPOSITORY,
        TOKENS.INSTITUTION_REPOSITORY,
        TOKENS.FINANCIAL_PROVIDER_PORT,
        TOKENS.CLOCK_PORT,
        TOKENS.ID_GENERATOR_PORT,
        TOKENS.AUDIT_PORT,
      ],
    },
    {
      provide: GetPaymentUseCase,
      useFactory: (
        consentRepository: PrismaConsentRepository,
        paymentRepository: PrismaPaymentRepository,
        authorizationDecision: AuthorizationDecisionService,
      ) => new GetPaymentUseCase(consentRepository, paymentRepository, authorizationDecision),
      inject: [TOKENS.CONSENT_REPOSITORY, TOKENS.PAYMENT_REPOSITORY, AuthorizationDecisionService],
    },
    {
      provide: CancelPaymentUseCase,
      useFactory: (
        unitOfWork: PrismaUnitOfWork,
        consentRepository: PrismaConsentRepository,
        paymentRepository: PrismaPaymentRepository,
        authorizationDecision: AuthorizationDecisionService,
        clock: SystemClock,
        idGenerator: UuidIdGenerator,
        audit: PrismaAuditRepository,
      ) =>
        new CancelPaymentUseCase(
          unitOfWork,
          consentRepository,
          paymentRepository,
          authorizationDecision,
          clock,
          idGenerator,
          audit,
        ),
      inject: [
        TOKENS.UNIT_OF_WORK_PORT,
        TOKENS.CONSENT_REPOSITORY,
        TOKENS.PAYMENT_REPOSITORY,
        AuthorizationDecisionService,
        TOKENS.CLOCK_PORT,
        TOKENS.ID_GENERATOR_PORT,
        TOKENS.AUDIT_PORT,
      ],
    },
    {
      provide: ProcessProviderCallbackUseCase,
      useFactory: (
        unitOfWork: PrismaUnitOfWork,
        paymentRepository: PrismaPaymentRepository,
        providerCallbackRepository: PrismaProviderCallbackRepository,
        provider: FinancialProviderAdapter,
        crypto: CryptoAdapter,
        clock: SystemClock,
        idGenerator: UuidIdGenerator,
      ) =>
        new ProcessProviderCallbackUseCase(
          unitOfWork,
          paymentRepository,
          providerCallbackRepository,
          provider,
          crypto,
          clock,
          idGenerator,
        ),
      inject: [
        TOKENS.UNIT_OF_WORK_PORT,
        TOKENS.PAYMENT_REPOSITORY,
        TOKENS.PROVIDER_CALLBACK_REPOSITORY,
        TOKENS.FINANCIAL_PROVIDER_PORT,
        TOKENS.CRYPTO_PORT,
        TOKENS.CLOCK_PORT,
        TOKENS.ID_GENERATOR_PORT,
      ],
    },
    {
      provide: CreateAuthorizationRequestUseCase,
      useFactory: (
        unitOfWork: PrismaUnitOfWork,
        clientRepository: PrismaClientRepository,
        institutionRepository: PrismaInstitutionRepository,
        consentRepository: PrismaConsentRepository,
        tokenRepository: PrismaTokenRepository,
        authorizationDecision: AuthorizationDecisionService,
        clock: SystemClock,
        idGenerator: UuidIdGenerator,
        audit: PrismaAuditRepository,
      ) =>
        new CreateAuthorizationRequestUseCase(
          unitOfWork,
          clientRepository,
          institutionRepository,
          consentRepository,
          tokenRepository,
          authorizationDecision,
          clock,
          idGenerator,
          audit,
        ),
      inject: [
        TOKENS.UNIT_OF_WORK_PORT,
        TOKENS.CLIENT_REPOSITORY,
        TOKENS.INSTITUTION_REPOSITORY,
        TOKENS.CONSENT_REPOSITORY,
        TOKENS.TOKEN_REPOSITORY,
        AuthorizationDecisionService,
        TOKENS.CLOCK_PORT,
        TOKENS.ID_GENERATOR_PORT,
        TOKENS.AUDIT_PORT,
      ],
    },
    {
      provide: ExchangeAuthorizationCodeUseCase,
      useFactory: (
        unitOfWork: PrismaUnitOfWork,
        clientRepository: PrismaClientRepository,
        consentRepository: PrismaConsentRepository,
        tokenRepository: PrismaTokenRepository,
        accessTokenIssuer: AccessTokenIssuerAdapter,
        crypto: CryptoAdapter,
        clock: SystemClock,
        idGenerator: UuidIdGenerator,
        audit: PrismaAuditRepository,
      ) =>
        new ExchangeAuthorizationCodeUseCase(
          unitOfWork,
          clientRepository,
          consentRepository,
          tokenRepository,
          accessTokenIssuer,
          crypto,
          clock,
          idGenerator,
          audit,
        ),
      inject: [
        TOKENS.UNIT_OF_WORK_PORT,
        TOKENS.CLIENT_REPOSITORY,
        TOKENS.CONSENT_REPOSITORY,
        TOKENS.TOKEN_REPOSITORY,
        TOKENS.ACCESS_TOKEN_ISSUER_PORT,
        TOKENS.CRYPTO_PORT,
        TOKENS.CLOCK_PORT,
        TOKENS.ID_GENERATOR_PORT,
        TOKENS.AUDIT_PORT,
      ],
    },
    {
      provide: RefreshTokensUseCase,
      useFactory: (
        unitOfWork: PrismaUnitOfWork,
        clientRepository: PrismaClientRepository,
        consentRepository: PrismaConsentRepository,
        tokenRepository: PrismaTokenRepository,
        accessTokenIssuer: AccessTokenIssuerAdapter,
        crypto: CryptoAdapter,
        clock: SystemClock,
        idGenerator: UuidIdGenerator,
        audit: PrismaAuditRepository,
      ) =>
        new RefreshTokensUseCase(
          unitOfWork,
          clientRepository,
          consentRepository,
          tokenRepository,
          accessTokenIssuer,
          crypto,
          clock,
          idGenerator,
          audit,
        ),
      inject: [
        TOKENS.UNIT_OF_WORK_PORT,
        TOKENS.CLIENT_REPOSITORY,
        TOKENS.CONSENT_REPOSITORY,
        TOKENS.TOKEN_REPOSITORY,
        TOKENS.ACCESS_TOKEN_ISSUER_PORT,
        TOKENS.CRYPTO_PORT,
        TOKENS.CLOCK_PORT,
        TOKENS.ID_GENERATOR_PORT,
        TOKENS.AUDIT_PORT,
      ],
    },
    {
      provide: RevokeTokenUseCase,
      useFactory: (
        unitOfWork: PrismaUnitOfWork,
        clientRepository: PrismaClientRepository,
        tokenRepository: PrismaTokenRepository,
        accessTokenValidator: AccessTokenValidatorAdapter,
        crypto: CryptoAdapter,
        clock: SystemClock,
        idGenerator: UuidIdGenerator,
        audit: PrismaAuditRepository,
      ) =>
        new RevokeTokenUseCase(
          unitOfWork,
          clientRepository,
          tokenRepository,
          accessTokenValidator,
          crypto,
          clock,
          idGenerator,
          audit,
        ),
      inject: [
        TOKENS.UNIT_OF_WORK_PORT,
        TOKENS.CLIENT_REPOSITORY,
        TOKENS.TOKEN_REPOSITORY,
        TOKENS.ACCESS_TOKEN_VALIDATOR_PORT,
        TOKENS.CRYPTO_PORT,
        TOKENS.CLOCK_PORT,
        TOKENS.ID_GENERATOR_PORT,
        TOKENS.AUDIT_PORT,
      ],
    },
    {
      provide: IntrospectTokenUseCase,
      useFactory: (
        clientRepository: PrismaClientRepository,
        tokenRepository: PrismaTokenRepository,
        accessTokenValidator: AccessTokenValidatorAdapter,
        crypto: CryptoAdapter,
        clock: SystemClock,
      ) =>
        new IntrospectTokenUseCase(
          clientRepository,
          tokenRepository,
          accessTokenValidator,
          crypto,
          clock,
        ),
      inject: [
        TOKENS.CLIENT_REPOSITORY,
        TOKENS.TOKEN_REPOSITORY,
        TOKENS.ACCESS_TOKEN_VALIDATOR_PORT,
        TOKENS.CRYPTO_PORT,
        TOKENS.CLOCK_PORT,
      ],
    },
    {
      provide: ListInstitutionsUseCase,
      useFactory: (institutionRepository: PrismaInstitutionRepository) =>
        new ListInstitutionsUseCase(institutionRepository),
      inject: [TOKENS.INSTITUTION_REPOSITORY],
    },
  ],
  exports: [
    ...PORT_PROVIDERS.map((provider) => provider.provide),
    TOKENS.EVENT_PUBLISHER_PORT,
    TOKENS.FINANCIAL_PROVIDER_PORT,
    TOKENS.TOKEN_SERVICE,
    TOKENS.OUTBOX_PUBLISHER,
    TOKENS.PAYMENT_RECONCILIATION,
    KafkaPublisher,
    FinancialProviderAdapter,
    ProviderRegistry,
    RedisService,
    OutboxPublisherService,
    PaymentReconciliationService,
    DependencyHealthIndicator,
    AuthorizationDecisionService,
    TOKENS.ACCESS_TOKEN_ISSUER_PORT,
    TOKENS.ACCESS_TOKEN_VALIDATOR_PORT,
    CreateConsentUseCase,
    AuthorizeConsentUseCase,
    ActivateConsentUseCase,
    RevokeConsentUseCase,
    ExpireConsentsUseCase,
    GetConsentUseCase,
    ListAccountsUseCase,
    GetAccountUseCase,
    GetBalancesUseCase,
    ListTransactionsUseCase,
    ListBeneficiariesUseCase,
    CreatePaymentUseCase,
    AuthorizePaymentUseCase,
    SubmitPaymentUseCase,
    GetPaymentUseCase,
    CancelPaymentUseCase,
    ProcessProviderCallbackUseCase,
    CreateAuthorizationRequestUseCase,
    ExchangeAuthorizationCodeUseCase,
    RefreshTokensUseCase,
    RevokeTokenUseCase,
    IntrospectTokenUseCase,
    ListInstitutionsUseCase,
  ],
})
export class InfrastructureModule {}
