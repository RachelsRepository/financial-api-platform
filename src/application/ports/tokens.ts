/** Injection token string constants for infrastructure wiring. */

export const TOKENS = {
  CONSENT_REPOSITORY: 'ConsentRepository',
  PAYMENT_REPOSITORY: 'PaymentRepository',
  ACCOUNT_REPOSITORY: 'AccountRepository',
  CLIENT_REPOSITORY: 'ClientRepository',
  INSTITUTION_REPOSITORY: 'InstitutionRepository',
  TOKEN_REPOSITORY: 'TokenRepository',
  OUTBOX_PORT: 'OutboxPort',
  OUTBOX_PUBLISHER: 'OutboxPublisher',
  AUDIT_PORT: 'AuditPort',
  EVENT_PUBLISHER_PORT: 'EventPublisherPort',
  FINANCIAL_PROVIDER_PORT: 'FinancialProviderPort',
  PROVIDER_CALLBACK_REPOSITORY: 'ProviderCallbackRepository',
  PAYMENT_RECONCILIATION: 'PaymentReconciliation',
  CLOCK_PORT: 'ClockPort',
  ID_GENERATOR_PORT: 'IdGeneratorPort',
  CRYPTO_PORT: 'CryptoPort',
  UNIT_OF_WORK_PORT: 'UnitOfWorkPort',
  TOKEN_SERVICE: 'TokenService',
  ACCESS_TOKEN_ISSUER_PORT: 'AccessTokenIssuerPort',
  ACCESS_TOKEN_VALIDATOR_PORT: 'AccessTokenValidatorPort',
} as const;

export type InjectionToken = (typeof TOKENS)[keyof typeof TOKENS];
