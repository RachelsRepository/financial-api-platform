export interface DomainEvent {
  eventId: string;
  aggregateId: string;
  aggregateType: string;
  eventType: string;
  version: number;
  timestamp: Date;
  correlationId: string | null;
  causationId: string | null;
  producer: string;
  payload: Record<string, unknown>;
}

export function createDomainEvent(input: {
  eventId: string;
  aggregateId: string;
  aggregateType: string;
  eventType: string;
  payload: Record<string, unknown>;
  correlationId?: string;
  causationId?: string;
  producer?: string;
  version?: number;
  timestamp?: Date;
}): DomainEvent {
  return {
    eventId: input.eventId,
    aggregateId: input.aggregateId,
    aggregateType: input.aggregateType,
    eventType: input.eventType,
    version: input.version ?? 1,
    timestamp: input.timestamp ?? new Date(),
    correlationId: input.correlationId ?? null,
    causationId: input.causationId ?? null,
    producer: input.producer ?? 'financial-api-platform',
    payload: input.payload,
  };
}

export const EventTypes = {
  CONSENT_CREATED: 'consent.created',
  CONSENT_AUTHORIZED: 'consent.authorized',
  CONSENT_ACTIVATED: 'consent.activated',
  CONSENT_REVOKED: 'consent.revoked',
  CONSENT_EXPIRED: 'consent.expired',
  TOKEN_ISSUED: 'token.issued',
  TOKEN_REVOKED: 'token.revoked',
  TOKEN_REUSE_DETECTED: 'token.reuse_detected',
  ACCOUNT_ACCESSED: 'account.accessed',
  PAYMENT_CREATED: 'payment.created',
  PAYMENT_AUTHORIZED: 'payment.authorized',
  PAYMENT_SUBMITTED: 'payment.submitted',
  PAYMENT_STATUS_CHANGED: 'payment.status_changed',
  PROVIDER_CALLBACK_RECEIVED: 'provider.callback_received',
  SECURITY_AUTHORIZATION_FAILED: 'security.authorization_failed',
} as const;
