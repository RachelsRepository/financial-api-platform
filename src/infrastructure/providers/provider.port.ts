import type {
  CanonicalProviderPaymentRequest,
  CanonicalProviderPaymentResult,
  CanonicalProviderStatus,
  WebhookVerificationInput,
  WebhookVerificationResult,
} from '@infrastructure/providers/types';

export interface FinancialProvider {
  readonly code: string;
  submitPayment(request: CanonicalProviderPaymentRequest): Promise<CanonicalProviderPaymentResult>;
  getPaymentStatus(providerPaymentId: string): Promise<CanonicalProviderStatus>;
  verifyWebhook(input: WebhookVerificationInput): Promise<WebhookVerificationResult>;
}

export type {
  CanonicalProviderPaymentRequest,
  CanonicalProviderPaymentResult,
  CanonicalProviderStatus,
  WebhookVerificationInput,
  WebhookVerificationResult,
};
