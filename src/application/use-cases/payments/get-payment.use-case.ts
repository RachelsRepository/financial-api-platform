import { AuthorizationError } from '../../../domain/errors';
import { SCOPES } from '../../../domain/value-objects';
import { type GetPaymentCommand, type GetPaymentResult } from '../../dto/payment.dto';
import { toPaymentSummary } from '../../mappers';
import { type ConsentRepository } from '../../ports/consent.repository';
import { type PaymentRepository } from '../../ports/payment.repository';
import { type AuthorizationDecisionService } from '../../services/authorization-decision.service';

export class GetPaymentUseCase {
  constructor(
    private readonly consentRepository: ConsentRepository,
    private readonly paymentRepository: PaymentRepository,
    private readonly authorizationDecision: AuthorizationDecisionService,
  ) {}

  async execute(command: GetPaymentCommand): Promise<GetPaymentResult> {
    const payment = await this.paymentRepository.findById(command.paymentId);
    if (payment === null) {
      throw new AuthorizationError(`Payment ${command.paymentId} not found`, 'not_found');
    }

    const consent = await this.consentRepository.findById(payment.consentId);
    if (consent === null) {
      throw new AuthorizationError(`Consent ${payment.consentId} not found`, 'not_found');
    }

    await this.authorizationDecision.requireAccountAccess({
      claims: command.claims,
      consent,
      requiredScope: SCOPES.PAYMENTS_READ,
    });

    if (payment.consentId !== command.consentId) {
      throw new AuthorizationError('Payment does not belong to token consent', 'forbidden');
    }

    return { payment: toPaymentSummary(payment) };
  }
}
