#!/usr/bin/env node
/**
 * Docker/local runtime smoke: OAuth → consent → accounts → payment → callback → reuse → revoke.
 * Requires API at BASE_URL (default http://127.0.0.1:3000) with seeded demo data.
 */
import { createHash, randomBytes } from 'node:crypto';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
const HOST = process.env.HOST_HEADER ?? 'localhost';
const CLIENT_ID = 'fap-demo-client';
const CLIENT_SECRET = 'demo-client-secret-change-me';
const USER_ID = '55555555-5555-4555-8555-555555555555';
const INSTITUTION_ID = '11111111-1111-4111-8111-111111111111';
const ACCOUNT_ID = '66666666-6666-4666-8666-666666666666';
const REDIRECT_URI = 'https://localhost:3001/oauth/callback';

function pkce() {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

async function request(method, path, { query, body, headers } = {}) {
  const url = new URL(path, BASE);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      url.searchParams.set(k, String(v));
    }
  }
  const response = await fetch(url, {
    method,
    headers: {
      Host: HOST,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!response.ok) {
    throw new Error(`${method} ${path} -> ${response.status}: ${text}`);
  }
  return json;
}

async function main() {
  const live = await request('GET', '/health/live');
  if (live.status !== 'ok') throw new Error('liveness failed');
  const ready = await request('GET', '/health/ready');
  if (ready.status !== 'ok') throw new Error('readiness failed');

  const { verifier, challenge } = pkce();
  const auth = await request('GET', '/oauth/authorize', {
    query: {
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope:
        'openid offline_access accounts:read balances:read payments:read payments:write consent:manage',
      state: 'smoke-state',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      user_id: USER_ID,
      institution_id: INSTITUTION_ID,
      purpose: 'Docker smoke demo',
    },
  });

  const authorized = await request('POST', `/api/v1/consents/${auth.consentId}/authorize`, {
    body: {
      accountIds: [ACCOUNT_ID],
      grantedScopes:
        'openid offline_access accounts:read balances:read payments:read payments:write consent:manage',
      actorUserId: USER_ID,
    },
  });

  const tokenRes = await fetch(new URL('/oauth/token', BASE), {
    method: 'POST',
    headers: { Host: HOST, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code: authorized.authorizationCode,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    }),
  });
  const tokens = await tokenRes.json();
  if (!tokenRes.ok) throw new Error(`token exchange failed: ${JSON.stringify(tokens)}`);
  if (!tokens.accessToken?.includes('.')) throw new Error('access token is not a JWT');

  const accounts = await request('GET', '/api/v1/accounts', {
    headers: { Authorization: `Bearer ${tokens.accessToken}` },
  });
  if (!Array.isArray(accounts.accounts) && !Array.isArray(accounts)) {
    // tolerate either envelope
  }

  const paymentCreated = await request('POST', '/api/v1/payments', {
    headers: {
      Authorization: `Bearer ${tokens.accessToken}`,
      'Idempotency-Key': `smoke-${Date.now()}`,
    },
    body: {
      sourceAccountId: ACCOUNT_ID,
      amountMinor: 1500,
      currency: 'USD',
      creditorName: 'Demo Merchant',
      creditorAccountRef: 'US00DEMO0000000001',
      reference: 'SMOKE-1',
    },
  });
  const paymentId = paymentCreated.payment?.id ?? paymentCreated.id;

  await request('POST', `/api/v1/payments/${paymentId}/authorize`, {
    headers: { Authorization: `Bearer ${tokens.accessToken}` },
    body: { actorUserId: USER_ID },
  });
  const submitted = await request('POST', `/api/v1/payments/${paymentId}/submit`, {
    headers: { Authorization: `Bearer ${tokens.accessToken}` },
    body: {},
  });
  const providerPaymentId = submitted.payment?.providerPaymentId ?? submitted.providerPaymentId;
  if (!providerPaymentId) throw new Error('missing providerPaymentId after submit');

  const callback = await request('POST', '/api/v1/webhooks/sandbox', {
    headers: { 'x-sandbox-token': 'sandbox-local' },
    body: {
      eventId: `evt-smoke-${Date.now()}`,
      paymentId: providerPaymentId,
      status: 'completed',
    },
  });
  if (!callback.processed) throw new Error(`callback not processed: ${JSON.stringify(callback)}`);

  const refreshRes = await fetch(new URL('/oauth/token', BASE), {
    method: 'POST',
    headers: { Host: HOST, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: tokens.refreshToken,
    }),
  });
  const refreshed = await refreshRes.json();
  if (!refreshRes.ok) throw new Error(`refresh failed: ${JSON.stringify(refreshed)}`);

  const reuseRes = await fetch(new URL('/oauth/token', BASE), {
    method: 'POST',
    headers: { Host: HOST, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: tokens.refreshToken,
    }),
  });
  if (reuseRes.status < 400) throw new Error('expected refresh reuse to fail');

  await request('POST', `/api/v1/consents/${auth.consentId}/revoke`, {
    headers: { Authorization: `Bearer ${refreshed.accessToken}` },
    body: { actorUserId: USER_ID },
  });

  const afterRevoke = await fetch(new URL('/api/v1/accounts', BASE), {
    headers: {
      Host: HOST,
      Authorization: `Bearer ${refreshed.accessToken}`,
      Accept: 'application/json',
    },
  });
  if (afterRevoke.status < 400) {
    throw new Error('expected revoked consent to block account access');
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        consentId: auth.consentId,
        paymentId,
        providerPaymentId,
        callbackStatus: callback.status,
        reuseStatus: reuseRes.status,
        revokeBlockedStatus: afterRevoke.status,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
