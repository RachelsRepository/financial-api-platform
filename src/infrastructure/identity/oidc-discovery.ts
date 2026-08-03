export interface OidcDiscoveryDocument {
  readonly issuer: string;
  readonly authorization_endpoint: string;
  readonly token_endpoint: string;
  readonly userinfo_endpoint: string;
  readonly jwks_uri: string;
  readonly registration_endpoint?: string;
  readonly scopes_supported: readonly string[];
  readonly response_types_supported: readonly string[];
  readonly grant_types_supported: readonly string[];
  readonly token_endpoint_auth_methods_supported: readonly string[];
  readonly id_token_signing_alg_values_supported: readonly string[];
  readonly code_challenge_methods_supported: readonly string[];
  readonly subject_types_supported: readonly string[];
  readonly claims_supported: readonly string[];
}

export interface OidcDiscoveryInput {
  readonly issuer: string;
  readonly authorizationEndpoint: string;
  readonly tokenEndpoint: string;
  readonly userinfoEndpoint: string;
  readonly jwksUri: string;
  readonly registrationEndpoint?: string;
}

export function buildOidcDiscoveryDocument(input: OidcDiscoveryInput): OidcDiscoveryDocument {
  const document: OidcDiscoveryDocument = {
    issuer: input.issuer,
    authorization_endpoint: input.authorizationEndpoint,
    token_endpoint: input.tokenEndpoint,
    userinfo_endpoint: input.userinfoEndpoint,
    jwks_uri: input.jwksUri,
    scopes_supported: [
      'openid',
      'offline_access',
      'accounts:read',
      'balances:read',
      'transactions:read',
      'beneficiaries:read',
      'payments:read',
      'payments:write',
      'consent:manage',
    ],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token', 'client_credentials'],
    token_endpoint_auth_methods_supported: [
      'client_secret_basic',
      'client_secret_post',
      'private_key_jwt',
      'tls_client_auth',
    ],
    id_token_signing_alg_values_supported: ['ES256'],
    code_challenge_methods_supported: ['S256'],
    subject_types_supported: ['public'],
    claims_supported: [
      'sub',
      'iss',
      'aud',
      'exp',
      'iat',
      'auth_time',
      'nonce',
      'client_id',
      'scope',
      'consent_id',
      'institution_id',
      'user_id',
    ],
  };

  if (input.registrationEndpoint) {
    return { ...document, registration_endpoint: input.registrationEndpoint };
  }

  return document;
}
