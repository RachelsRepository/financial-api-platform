import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

export const METRICS_REGISTRY = new Registry();

collectDefaultMetrics({
  register: METRICS_REGISTRY,
  prefix: 'financial_api_',
});

export const tokensIssuedTotal = new Counter({
  name: 'financial_api_tokens_issued_total',
  help: 'Total access tokens issued',
  registers: [METRICS_REGISTRY],
});

export const tokenRefreshFailuresTotal = new Counter({
  name: 'financial_api_token_refresh_failures_total',
  help: 'Total refresh token failures',
  labelNames: ['reason'],
  registers: [METRICS_REGISTRY],
});

export const refreshReuseDetectedTotal = new Counter({
  name: 'financial_api_refresh_reuse_detected_total',
  help: 'Total refresh token reuse detections',
  registers: [METRICS_REGISTRY],
});

export const consentTransitionsTotal = new Counter({
  name: 'financial_api_consent_transitions_total',
  help: 'Total consent state transitions',
  labelNames: ['from', 'to'],
  registers: [METRICS_REGISTRY],
});

export const consentsExpiredTotal = new Counter({
  name: 'financial_api_consents_expired_total',
  help: 'Total consents expired by background worker',
  registers: [METRICS_REGISTRY],
});

export const authorizationFailuresTotal = new Counter({
  name: 'financial_api_authorization_failures_total',
  help: 'Total authorization failures',
  labelNames: ['reason'],
  registers: [METRICS_REGISTRY],
});

export const accountRequestsTotal = new Counter({
  name: 'financial_api_account_requests_total',
  help: 'Total account API requests',
  labelNames: ['operation'],
  registers: [METRICS_REGISTRY],
});

export const accountRequestDurationSeconds = new Histogram({
  name: 'financial_api_account_request_duration_seconds',
  help: 'Account API request duration in seconds',
  labelNames: ['operation'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [METRICS_REGISTRY],
});

export const paymentsCreatedTotal = new Counter({
  name: 'financial_api_payments_created_total',
  help: 'Total payments created',
  registers: [METRICS_REGISTRY],
});

export const paymentDurationSeconds = new Histogram({
  name: 'financial_api_payment_duration_seconds',
  help: 'Payment operation duration in seconds',
  labelNames: ['operation'],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [METRICS_REGISTRY],
});

export const providerFailuresTotal = new Counter({
  name: 'financial_api_provider_failures_total',
  help: 'Total provider call failures',
  labelNames: ['provider', 'operation'],
  registers: [METRICS_REGISTRY],
});

export const providerTimeoutsTotal = new Counter({
  name: 'financial_api_provider_timeouts_total',
  help: 'Total provider call timeouts',
  labelNames: ['provider', 'operation'],
  registers: [METRICS_REGISTRY],
});

export const outboxPending = new Gauge({
  name: 'financial_api_outbox_pending',
  help: 'Current pending outbox events',
  registers: [METRICS_REGISTRY],
});

export const outboxPublishedTotal = new Counter({
  name: 'financial_api_outbox_published_total',
  help: 'Total outbox events published',
  registers: [METRICS_REGISTRY],
});

export const dlqDepth = new Gauge({
  name: 'financial_api_dlq_depth',
  help: 'Current dead-letter queue depth',
  registers: [METRICS_REGISTRY],
});

export const rateLimitRejectionsTotal = new Counter({
  name: 'financial_api_rate_limit_rejections_total',
  help: 'Total rate limit rejections',
  labelNames: ['route'],
  registers: [METRICS_REGISTRY],
});

export async function getMetricsSnapshot(): Promise<string> {
  return METRICS_REGISTRY.metrics();
}
