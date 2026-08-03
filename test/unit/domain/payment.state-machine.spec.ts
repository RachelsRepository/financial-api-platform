import { describe, expect, it } from 'vitest';
import { InvalidStateTransitionError } from '../../../src/domain/errors';
import {
  PaymentStatus,
  PROVIDER_STATUS_MAP,
  assertPaymentTransition,
  canTransitionPayment,
  isCancellable,
  isTerminalPayment,
} from '../../../src/domain/policies/state-machines';

const ALL_STATUSES = Object.values(PaymentStatus);

const VALID_TRANSITIONS: Array<[PaymentStatus, PaymentStatus]> = [
  [PaymentStatus.CREATED, PaymentStatus.AWAITING_AUTHORIZATION],
  [PaymentStatus.CREATED, PaymentStatus.CANCELLED],
  [PaymentStatus.AWAITING_AUTHORIZATION, PaymentStatus.AUTHORIZED],
  [PaymentStatus.AWAITING_AUTHORIZATION, PaymentStatus.REJECTED],
  [PaymentStatus.AWAITING_AUTHORIZATION, PaymentStatus.CANCELLED],
  [PaymentStatus.AUTHORIZED, PaymentStatus.SUBMITTED],
  [PaymentStatus.AUTHORIZED, PaymentStatus.CANCELLED],
  [PaymentStatus.AUTHORIZED, PaymentStatus.FAILED],
  [PaymentStatus.SUBMITTED, PaymentStatus.ACCEPTED],
  [PaymentStatus.SUBMITTED, PaymentStatus.REJECTED],
  [PaymentStatus.SUBMITTED, PaymentStatus.FAILED],
  [PaymentStatus.SUBMITTED, PaymentStatus.SETTLED],
  [PaymentStatus.ACCEPTED, PaymentStatus.SETTLED],
  [PaymentStatus.ACCEPTED, PaymentStatus.FAILED],
  [PaymentStatus.ACCEPTED, PaymentStatus.REJECTED],
];

function pairKey(from: PaymentStatus, to: PaymentStatus): string {
  return `${from}->${to}`;
}

describe('Payment state machine', () => {
  it('allows every documented valid transition', () => {
    for (const [from, to] of VALID_TRANSITIONS) {
      expect(canTransitionPayment(from, to)).toBe(true);
      expect(() => assertPaymentTransition(from, to)).not.toThrow();
    }
  });

  it('rejects every invalid transition including self-transitions', () => {
    const validSet = new Set(VALID_TRANSITIONS.map(([from, to]) => pairKey(from, to)));

    for (const from of ALL_STATUSES) {
      for (const to of ALL_STATUSES) {
        const key = pairKey(from, to);
        const expected = validSet.has(key);

        expect(canTransitionPayment(from, to)).toBe(expected);

        if (!expected) {
          expect(() => assertPaymentTransition(from, to)).toThrow(InvalidStateTransitionError);
        }
      }
    }
  });

  it('identifies terminal and cancellable statuses', () => {
    expect(isTerminalPayment(PaymentStatus.SETTLED)).toBe(true);
    expect(isTerminalPayment(PaymentStatus.FAILED)).toBe(true);
    expect(isTerminalPayment(PaymentStatus.REJECTED)).toBe(true);
    expect(isTerminalPayment(PaymentStatus.CANCELLED)).toBe(true);
    expect(isTerminalPayment(PaymentStatus.AUTHORIZED)).toBe(false);

    expect(isCancellable(PaymentStatus.CREATED)).toBe(true);
    expect(isCancellable(PaymentStatus.AWAITING_AUTHORIZATION)).toBe(true);
    expect(isCancellable(PaymentStatus.AUTHORIZED)).toBe(true);
    expect(isCancellable(PaymentStatus.SUBMITTED)).toBe(false);
  });

  it('maps provider statuses to platform statuses', () => {
    expect(PROVIDER_STATUS_MAP.pending).toBe(PaymentStatus.SUBMITTED);
    expect(PROVIDER_STATUS_MAP.settled).toBe(PaymentStatus.SETTLED);
  });
});
