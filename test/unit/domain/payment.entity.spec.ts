import { describe, expect, it } from 'vitest';
import { InvalidStateTransitionError } from '../../../src/domain/errors';
import { Payment } from '../../../src/domain/entities';
import { PaymentStatus } from '../../../src/domain/policies/state-machines';
import { Money } from '../../../src/domain/value-objects';
import { FIXED_NOW, IDS } from '../../helpers/mocks';

function buildPayment() {
  return Payment.create({
    id: IDS.payment,
    consentId: IDS.consent,
    clientId: IDS.client,
    institutionId: IDS.institution,
    userId: IDS.user,
    sourceAccountId: IDS.account,
    amount: Money.of(1500, 'GBP'),
    creditorName: 'Utility Co',
    creditorAccountRef: 'GB00DEMO00000000000001',
    reference: 'INV-1001',
    providerCode: 'sandbox',
    idempotencyKey: 'idem-001',
    now: FIXED_NOW,
  });
}

describe('Payment entity', () => {
  it('creates payment in CREATED status', () => {
    const payment = buildPayment();
    expect(payment.status).toBe(PaymentStatus.CREATED);
    expect(payment.amount.amountMinor).toBe(1500);
  });

  it('progresses through authorization and submission', () => {
    const payment = buildPayment();
    payment.requestAuthorization(FIXED_NOW);
    payment.authorize(FIXED_NOW);
    payment.submit('sbx_provider_001', FIXED_NOW);

    expect(payment.status).toBe(PaymentStatus.SUBMITTED);
    expect(payment.providerPaymentId).toBe('sbx_provider_001');
  });

  it('applies provider status updates', () => {
    const payment = buildPayment();
    payment.requestAuthorization(FIXED_NOW);
    payment.authorize(FIXED_NOW);
    payment.submit('sbx_provider_001', FIXED_NOW);
    payment.applyProviderStatus(PaymentStatus.SETTLED, undefined, FIXED_NOW);

    expect(payment.status).toBe(PaymentStatus.SETTLED);
    expect(payment.settledAt).toEqual(FIXED_NOW);
  });

  it('cancels from cancellable states', () => {
    const payment = buildPayment();
    payment.requestAuthorization(FIXED_NOW);
    payment.cancel(FIXED_NOW);
    expect(payment.status).toBe(PaymentStatus.CANCELLED);
  });

  it('rejects invalid transitions', () => {
    const payment = buildPayment();
    expect(() => payment.submit('sbx_provider_001')).toThrow(InvalidStateTransitionError);
  });
});
