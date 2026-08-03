import { describe, expect, it } from 'vitest';
import { InvalidStateTransitionError } from '../../../src/domain/errors';
import {
  ConsentStatus,
  assertConsentTransition,
  canTransitionConsent,
  isAccessGrantingConsent,
  isTerminalConsent,
} from '../../../src/domain/policies/state-machines';

const ALL_STATUSES = Object.values(ConsentStatus);

const VALID_TRANSITIONS: Array<[ConsentStatus, ConsentStatus]> = [
  [ConsentStatus.DRAFT, ConsentStatus.AWAITING_AUTHORIZATION],
  [ConsentStatus.DRAFT, ConsentStatus.REJECTED],
  [ConsentStatus.AWAITING_AUTHORIZATION, ConsentStatus.AUTHORIZED],
  [ConsentStatus.AWAITING_AUTHORIZATION, ConsentStatus.REJECTED],
  [ConsentStatus.AWAITING_AUTHORIZATION, ConsentStatus.EXPIRED],
  [ConsentStatus.AUTHORIZED, ConsentStatus.ACTIVE],
  [ConsentStatus.AUTHORIZED, ConsentStatus.REVOKED],
  [ConsentStatus.AUTHORIZED, ConsentStatus.EXPIRED],
  [ConsentStatus.ACTIVE, ConsentStatus.REVOKED],
  [ConsentStatus.ACTIVE, ConsentStatus.EXPIRED],
];

function pairKey(from: ConsentStatus, to: ConsentStatus): string {
  return `${from}->${to}`;
}

describe('Consent state machine', () => {
  it('allows every documented valid transition', () => {
    for (const [from, to] of VALID_TRANSITIONS) {
      expect(canTransitionConsent(from, to)).toBe(true);
      expect(() => assertConsentTransition(from, to)).not.toThrow();
    }
  });

  it('rejects every invalid transition including self-transitions', () => {
    const validSet = new Set(VALID_TRANSITIONS.map(([from, to]) => pairKey(from, to)));

    for (const from of ALL_STATUSES) {
      for (const to of ALL_STATUSES) {
        const key = pairKey(from, to);
        const expected = validSet.has(key);

        expect(canTransitionConsent(from, to)).toBe(expected);

        if (!expected) {
          expect(() => assertConsentTransition(from, to)).toThrow(InvalidStateTransitionError);
        }
      }
    }
  });

  it('identifies terminal and access-granting statuses', () => {
    expect(isTerminalConsent(ConsentStatus.REVOKED)).toBe(true);
    expect(isTerminalConsent(ConsentStatus.EXPIRED)).toBe(true);
    expect(isTerminalConsent(ConsentStatus.REJECTED)).toBe(true);
    expect(isTerminalConsent(ConsentStatus.ACTIVE)).toBe(false);

    expect(isAccessGrantingConsent(ConsentStatus.AUTHORIZED)).toBe(true);
    expect(isAccessGrantingConsent(ConsentStatus.ACTIVE)).toBe(true);
    expect(isAccessGrantingConsent(ConsentStatus.DRAFT)).toBe(false);
  });
});
