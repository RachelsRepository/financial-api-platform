export interface ProductionGuardEnv {
  readonly nodeEnv: string;
  readonly tokenIssuer?: string;
  readonly jwtPrivateJwk?: string;
  readonly jwtActiveKid?: string;
  readonly databaseUrl?: string;
  readonly redisUrl?: string;
  readonly enableProviderSandbox?: boolean | string;
  readonly trustedHosts?: string;
  readonly enableSwagger?: boolean | string;
  readonly mtlsRequired?: boolean | string;
}

const PLACEHOLDER_PATTERNS = [
  /PLACEHOLDER/i,
  /changeme/i,
  /replace[_-]?me/i,
  /example\.com/i,
  /localhost/i,
  /127\.0\.0\.1/i,
  /dev[_-]?secret/i,
  /your[_-]?secret/i,
];

function isTruthy(value: boolean | string | undefined): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
  }
  return false;
}

function containsPlaceholder(value: string | undefined): boolean {
  if (!value) {
    return true;
  }
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(value));
}

function assertProduction(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Production misconfiguration: ${message}`);
  }
}

export function rejectProductionMisconfiguration(env: ProductionGuardEnv): void {
  if (env.nodeEnv !== 'production') {
    return;
  }

  assertProduction(
    !isTruthy(env.enableProviderSandbox),
    'ENABLE_PROVIDER_SANDBOX must be disabled',
  );
  assertProduction(!isTruthy(env.enableSwagger), 'ENABLE_SWAGGER must be disabled');
  assertProduction(isTruthy(env.mtlsRequired), 'MTLS_REQUIRED must be enabled');

  assertProduction(
    !containsPlaceholder(env.jwtPrivateJwk),
    'JWT_PRIVATE_JWK must not contain placeholder values',
  );
  assertProduction(
    !containsPlaceholder(env.jwtActiveKid),
    'JWT_ACTIVE_KID must not contain placeholder values',
  );
  assertProduction(
    !containsPlaceholder(env.databaseUrl),
    'DATABASE_URL must not contain placeholder values',
  );
  assertProduction(
    !containsPlaceholder(env.redisUrl),
    'REDIS_URL must not contain placeholder values',
  );

  if (env.tokenIssuer) {
    assertProduction(
      !containsPlaceholder(env.tokenIssuer),
      'TOKEN_ISSUER must not contain placeholder values',
    );
    assertProduction(
      env.tokenIssuer.startsWith('https://'),
      'TOKEN_ISSUER must use HTTPS in production',
    );
  }

  if (env.trustedHosts) {
    const hosts = env.trustedHosts
      .split(',')
      .map((host) => host.trim())
      .filter(Boolean);
    assertProduction(!hosts.includes('*'), 'TRUSTED_HOSTS must not contain wildcards');
    assertProduction(
      !hosts.some((host) => host === 'localhost' || host === '127.0.0.1'),
      'TRUSTED_HOSTS must not include localhost in production',
    );
  }
}
