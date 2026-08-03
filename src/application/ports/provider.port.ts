import { type Money } from '../../domain/value-objects';

export interface SubmitPaymentRequest {
  paymentId: string;
  institutionCode: string;
  providerCode: string;
  amount: Money;
  sourceAccountRef: string;
  creditorName: string;
  creditorAccountRef: string;
  reference: string;
}

export interface ProviderPaymentStatus {
  providerPaymentId: string;
  normalizedStatus: string;
  reason: string | null;
}

export interface WebhookVerificationResult {
  valid: boolean;
  eventId: string | null;
  providerPaymentId: string | null;
  normalizedStatus: string | null;
  reason: string | null;
}

export interface FinancialProviderPort {
  submitPayment(request: SubmitPaymentRequest): Promise<ProviderPaymentStatus>;
  getPaymentStatus(providerCode: string, providerPaymentId: string): Promise<ProviderPaymentStatus>;
  verifyWebhook(
    providerCode: string,
    headers: Record<string, string>,
    body: string,
  ): Promise<WebhookVerificationResult>;
}
