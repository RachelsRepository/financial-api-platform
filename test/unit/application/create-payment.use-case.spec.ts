import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Payment } from '../../../src/domain/entities';
import { AuthorizationError } from '../../../src/domain/errors';
import { Money, ScopeSet, SCOPES } from '../../../src/domain/value-objects';
import { AuthorizationDecisionService } from '../../../src/application/services/authorization-decision.service';
import { CreatePaymentUseCase } from '../../../src/application/use-cases/payments/create-payment.use-case';
import {
  buildConsent,
  buildTokenClaims,
  createAuditMock,
  createClientRepositoryMock,
  createClockMock,
  createConsentRepositoryMock,
  createIdGeneratorMock,
  createInstitutionRepositoryMock,
  createPaymentRepositoryMock,
  createUnitOfWorkMock,
  FIXED_NOW,
  IDS,
} from '../../helpers/mocks';

describe('CreatePaymentUseCase', () => {
  let useCase: CreatePaymentUseCase;
  let paymentRepository: ReturnType<typeof createPaymentRepositoryMock>;
  let consentRepository: ReturnType<typeof createConsentRepositoryMock>;

  beforeEach(() => {
    paymentRepository = createPaymentRepositoryMock();
    const activeConsent = buildConsent();
    activeConsent.submitForAuthorization(FIXED_NOW);
    activeConsent.authorize({
      accountIds: [IDS.account],
      grantedScopes: ScopeSet.fromString(`${SCOPES.PAYMENTS_WRITE} ${SCOPES.ACCOUNTS_READ}`),
      now: FIXED_NOW,
    });
    activeConsent.activate(FIXED_NOW);
    consentRepository = createConsentRepositoryMock(activeConsent);

    useCase = new CreatePaymentUseCase(
      createUnitOfWorkMock(),
      consentRepository,
      paymentRepository,
      createInstitutionRepositoryMock(),
      new AuthorizationDecisionService(createClientRepositoryMock()),
      createClockMock(),
      createIdGeneratorMock(),
      createAuditMock(),
    );
  });

  it('creates payment when authorized', async () => {
    const result = await useCase.execute({
      claims: buildTokenClaims({
        scopes: ScopeSet.fromString(`${SCOPES.PAYMENTS_WRITE} ${SCOPES.ACCOUNTS_READ}`),
      }),
      consentId: IDS.consent,
      sourceAccountId: IDS.account,
      amountMinor: 2500,
      currency: 'GBP',
      creditorName: 'Supplier Ltd',
      creditorAccountRef: 'GB00DEMO00000000000001',
      reference: 'PO-7781',
    });

    expect(result.payment.status).toBe('AWAITING_AUTHORIZATION');
    expect(paymentRepository.save).toHaveBeenCalled();
  });

  it('returns existing payment for idempotency key', async () => {
    const existing = Payment.create({
      id: IDS.payment,
      consentId: IDS.consent,
      clientId: IDS.client,
      institutionId: IDS.institution,
      userId: IDS.user,
      sourceAccountId: IDS.account,
      amount: Money.of(2500, 'GBP'),
      creditorName: 'Supplier Ltd',
      creditorAccountRef: 'GB00DEMO00000000000001',
      reference: 'PO-7781',
      providerCode: 'sandbox',
      idempotencyKey: 'idem-001',
      now: FIXED_NOW,
    });
    existing.requestAuthorization(FIXED_NOW);
    paymentRepository.findByIdempotencyKey = vi.fn(async () => existing);

    const result = await useCase.execute({
      claims: buildTokenClaims({
        scopes: ScopeSet.fromString(`${SCOPES.PAYMENTS_WRITE} ${SCOPES.ACCOUNTS_READ}`),
      }),
      consentId: IDS.consent,
      sourceAccountId: IDS.account,
      amountMinor: 2500,
      currency: 'GBP',
      creditorName: 'Supplier Ltd',
      creditorAccountRef: 'GB00DEMO00000000000001',
      reference: 'PO-7781',
      idempotencyKey: 'idem-001',
    });

    expect(result.payment.id).toBe(IDS.payment);
    expect(paymentRepository.save).not.toHaveBeenCalled();
  });

  it('rejects when consent is missing', async () => {
    consentRepository.findById = vi.fn(async () => null);

    await expect(
      useCase.execute({
        claims: buildTokenClaims(),
        consentId: IDS.consent,
        sourceAccountId: IDS.account,
        amountMinor: 100,
        currency: 'GBP',
        creditorName: 'Supplier Ltd',
        creditorAccountRef: 'GB00DEMO00000000000001',
        reference: 'PO-7781',
      }),
    ).rejects.toThrow(AuthorizationError);
  });

  it('rejects when consent is not active enough for payments', async () => {
    const draftConsent = buildConsent();
    consentRepository.findById = vi.fn(async () => draftConsent);

    await expect(
      useCase.execute({
        claims: buildTokenClaims(),
        consentId: IDS.consent,
        sourceAccountId: IDS.account,
        amountMinor: 100,
        currency: 'GBP',
        creditorName: 'Supplier Ltd',
        creditorAccountRef: 'GB00DEMO00000000000001',
        reference: 'PO-7781',
      }),
    ).rejects.toThrow(AuthorizationError);
  });
});
