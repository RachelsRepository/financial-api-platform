import { Inject, Injectable } from '@nestjs/common';
import type {
  FinancialProviderPort,
  ProviderPaymentStatus,
  SubmitPaymentRequest,
  WebhookVerificationResult,
} from '../../application/ports/provider.port';
import { ProviderRegistry } from './provider.registry';

@Injectable()
export class FinancialProviderAdapter implements FinancialProviderPort {
  constructor(@Inject(ProviderRegistry) private readonly registry: ProviderRegistry) {}

  async submitPayment(request: SubmitPaymentRequest): Promise<ProviderPaymentStatus> {
    const provider = this.registry.resolve(request.providerCode);
    const result = await provider.submitPayment({
      paymentId: request.paymentId,
      amountMinor: request.amount.amountMinor,
      currency: request.amount.currency,
      debtorAccountId: request.sourceAccountRef,
      creditorAccountId: request.creditorAccountRef,
      creditorName: request.creditorName,
      reference: request.reference,
      institutionId: request.institutionCode,
      idempotencyKey: request.paymentId,
    });

    return {
      providerPaymentId: result.providerPaymentId,
      normalizedStatus: result.status,
      reason: result.rawStatus ?? null,
    };
  }

  async getPaymentStatus(
    providerCode: string,
    providerPaymentId: string,
  ): Promise<ProviderPaymentStatus> {
    const provider = this.registry.resolve(providerCode);
    const result = await provider.getPaymentStatus(providerPaymentId);

    return {
      providerPaymentId: result.providerPaymentId,
      normalizedStatus: result.status,
      reason: result.failureReason ?? result.rawStatus,
    };
  }

  async verifyWebhook(
    providerCode: string,
    headers: Record<string, string>,
    body: string,
  ): Promise<WebhookVerificationResult> {
    const provider = this.registry.resolve(providerCode);
    const result = await provider.verifyWebhook({
      headers,
      rawBody: body,
    });

    return {
      valid: result.valid,
      eventId: result.eventId.length > 0 ? result.eventId : null,
      providerPaymentId: result.paymentId ?? null,
      normalizedStatus: result.status ?? null,
      reason: result.valid ? null : 'invalid_signature',
    };
  }
}
