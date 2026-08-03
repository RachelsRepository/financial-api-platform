import { InvalidStateTransitionError } from '../errors';

export enum ConsentStatus {
  DRAFT = 'DRAFT',
  AWAITING_AUTHORIZATION = 'AWAITING_AUTHORIZATION',
  AUTHORIZED = 'AUTHORIZED',
  ACTIVE = 'ACTIVE',
  REVOKED = 'REVOKED',
  EXPIRED = 'EXPIRED',
  REJECTED = 'REJECTED',
}

const CONSENT_TRANSITIONS: Record<ConsentStatus, ReadonlySet<ConsentStatus>> = {
  [ConsentStatus.DRAFT]: new Set([ConsentStatus.AWAITING_AUTHORIZATION, ConsentStatus.REJECTED]),
  [ConsentStatus.AWAITING_AUTHORIZATION]: new Set([
    ConsentStatus.AUTHORIZED,
    ConsentStatus.REJECTED,
    ConsentStatus.EXPIRED,
  ]),
  [ConsentStatus.AUTHORIZED]: new Set([
    ConsentStatus.ACTIVE,
    ConsentStatus.REVOKED,
    ConsentStatus.EXPIRED,
  ]),
  [ConsentStatus.ACTIVE]: new Set([ConsentStatus.REVOKED, ConsentStatus.EXPIRED]),
  [ConsentStatus.REVOKED]: new Set(),
  [ConsentStatus.EXPIRED]: new Set(),
  [ConsentStatus.REJECTED]: new Set(),
};

export function canTransitionConsent(current: ConsentStatus, target: ConsentStatus): boolean {
  return CONSENT_TRANSITIONS[current].has(target);
}

export function assertConsentTransition(current: ConsentStatus, target: ConsentStatus): void {
  if (!canTransitionConsent(current, target)) {
    throw new InvalidStateTransitionError('Consent', current, target);
  }
}

export function isTerminalConsent(status: ConsentStatus): boolean {
  return (
    status === ConsentStatus.REVOKED ||
    status === ConsentStatus.EXPIRED ||
    status === ConsentStatus.REJECTED
  );
}

export function isAccessGrantingConsent(status: ConsentStatus): boolean {
  return status === ConsentStatus.AUTHORIZED || status === ConsentStatus.ACTIVE;
}

export enum PaymentStatus {
  CREATED = 'CREATED',
  AWAITING_AUTHORIZATION = 'AWAITING_AUTHORIZATION',
  AUTHORIZED = 'AUTHORIZED',
  SUBMITTED = 'SUBMITTED',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  SETTLED = 'SETTLED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

const PAYMENT_TRANSITIONS: Record<PaymentStatus, ReadonlySet<PaymentStatus>> = {
  [PaymentStatus.CREATED]: new Set([PaymentStatus.AWAITING_AUTHORIZATION, PaymentStatus.CANCELLED]),
  [PaymentStatus.AWAITING_AUTHORIZATION]: new Set([
    PaymentStatus.AUTHORIZED,
    PaymentStatus.REJECTED,
    PaymentStatus.CANCELLED,
  ]),
  [PaymentStatus.AUTHORIZED]: new Set([
    PaymentStatus.SUBMITTED,
    PaymentStatus.CANCELLED,
    PaymentStatus.FAILED,
  ]),
  [PaymentStatus.SUBMITTED]: new Set([
    PaymentStatus.ACCEPTED,
    PaymentStatus.REJECTED,
    PaymentStatus.FAILED,
    PaymentStatus.SETTLED,
  ]),
  [PaymentStatus.ACCEPTED]: new Set([
    PaymentStatus.SETTLED,
    PaymentStatus.FAILED,
    PaymentStatus.REJECTED,
  ]),
  [PaymentStatus.REJECTED]: new Set(),
  [PaymentStatus.SETTLED]: new Set(),
  [PaymentStatus.FAILED]: new Set(),
  [PaymentStatus.CANCELLED]: new Set(),
};

export function canTransitionPayment(current: PaymentStatus, target: PaymentStatus): boolean {
  return PAYMENT_TRANSITIONS[current].has(target);
}

export function assertPaymentTransition(current: PaymentStatus, target: PaymentStatus): void {
  if (!canTransitionPayment(current, target)) {
    throw new InvalidStateTransitionError('Payment', current, target);
  }
}

export function isTerminalPayment(status: PaymentStatus): boolean {
  return (
    status === PaymentStatus.REJECTED ||
    status === PaymentStatus.SETTLED ||
    status === PaymentStatus.FAILED ||
    status === PaymentStatus.CANCELLED
  );
}

export function isCancellable(status: PaymentStatus): boolean {
  return (
    status === PaymentStatus.CREATED ||
    status === PaymentStatus.AWAITING_AUTHORIZATION ||
    status === PaymentStatus.AUTHORIZED
  );
}

/** Map provider-normalized statuses into platform payment statuses. */
export const PROVIDER_STATUS_MAP: Record<string, PaymentStatus> = {
  pending: PaymentStatus.SUBMITTED,
  processing: PaymentStatus.ACCEPTED,
  accepted: PaymentStatus.ACCEPTED,
  completed: PaymentStatus.SETTLED,
  settled: PaymentStatus.SETTLED,
  rejected: PaymentStatus.REJECTED,
  failed: PaymentStatus.FAILED,
  cancelled: PaymentStatus.FAILED,
};
