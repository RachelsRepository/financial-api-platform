import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Payment } from '../../../src/domain/entities';
import { Money } from '../../../src/domain/value-objects';
import { PaymentStatus } from '../../../src/domain/policies/state-machines';
import { ProcessProviderCallbackUseCase } from '../../../src/application/use-cases/payments/process-provider-callback.use-case';
import {
  createClockMock,
  createCryptoMock,
  createIdGeneratorMock,
  createPaymentRepositoryMock,
  createUnitOfWorkMock,
  FIXED_NOW,
  IDS,
} from '../../helpers/mocks';

function buildSubmittedPayment(): Payment {
  const payment = Payment.create({
    id: IDS.payment,
    consentId: IDS.consent,
    clientId: IDS.client,
    institutionId: IDS.institution,
    userId: IDS.user,
    sourceAccountId: IDS.account,
    amount: Money.of(1000, 'GBP'),
    creditorName: 'Demo Creditor',
    creditorAccountRef: 'GB00DEMO0000000000',
    reference: 'demo-ref',
    providerCode: 'sandbox',
    idempotencyKey: 'idem-1',
    now: FIXED_NOW,
  });
  payment.requestAuthorization(FIXED_NOW);
  payment.authorize(FIXED_NOW);
  payment.submit('sbx_provider_payment_1', FIXED_NOW);
  return payment;
}

describe('ProcessProviderCallbackUseCase', () => {
  let useCase: ProcessProviderCallbackUseCase;
  let paymentRepository: ReturnType<typeof createPaymentRepositoryMock>;
  let providerCallbackRepository: {
    findByProviderEvent: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    markProcessed: ReturnType<typeof vi.fn>;
  };
  let provider: {
    verifyWebhook: ReturnType<typeof vi.fn>;
    submitPayment: ReturnType<typeof vi.fn>;
    getPaymentStatus: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    paymentRepository = createPaymentRepositoryMock();
    providerCallbackRepository = {
      findByProviderEvent: vi.fn(async () => null),
      save: vi.fn(async () => undefined),
      markProcessed: vi.fn(async () => undefined),
    };
    provider = {
      verifyWebhook: vi.fn(async () => ({
        valid: true,
        eventId: 'evt-1',
        providerPaymentId: 'sbx_provider_payment_1',
        normalizedStatus: 'accepted',
        reason: null,
      })),
      submitPayment: vi.fn(),
      getPaymentStatus: vi.fn(),
    };

    useCase = new ProcessProviderCallbackUseCase(
      createUnitOfWorkMock(),
      paymentRepository,
      providerCallbackRepository,
      provider,
      createCryptoMock(),
      createClockMock(),
      createIdGeneratorMock(),
    );
  });

  it('applies provider status and records callback receipt', async () => {
    const payment = buildSubmittedPayment();
    paymentRepository.findByProviderPaymentId = vi.fn(async () => payment);

    const result = await useCase.execute({
      providerCode: 'sandbox',
      headers: { 'x-sandbox-token': 'sandbox-local' },
      body: JSON.stringify({
        eventId: 'evt-1',
        paymentId: 'sbx_provider_payment_1',
        status: 'accepted',
      }),
    });

    expect(result.processed).toBe(true);
    expect(result.status).toBe(PaymentStatus.ACCEPTED);
    expect(providerCallbackRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        providerEventId: 'evt-1',
        paymentId: IDS.payment,
        signatureValid: true,
      }),
    );
    expect(paymentRepository.save).toHaveBeenCalled();
  });

  it('rejects replay of an already processed event', async () => {
    providerCallbackRepository.findByProviderEvent = vi.fn(async () => ({
      id: IDS.token,
      providerCode: 'sandbox',
      providerEventId: 'evt-1',
      paymentId: IDS.payment,
      payloadHash: 'hash',
      signatureValid: true,
      processedAt: FIXED_NOW,
      createdAt: FIXED_NOW,
    }));

    const result = await useCase.execute({
      providerCode: 'sandbox',
      headers: {},
      body: '{}',
    });

    expect(result.processed).toBe(false);
    expect(result.status).toBe('duplicate');
    expect(paymentRepository.save).not.toHaveBeenCalled();
  });
});
