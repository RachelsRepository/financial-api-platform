export type CanonicalProviderPaymentStatus =
  'accepted' | 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'rejected';

export interface CanonicalProviderPaymentRequest {
  readonly paymentId: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly debtorAccountId: string;
  readonly creditorAccountId: string;
  readonly creditorName: string;
  readonly reference: string;
  readonly institutionId: string;
  readonly idempotencyKey: string;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface CanonicalProviderPaymentResult {
  readonly providerPaymentId: string;
  readonly status: CanonicalProviderPaymentStatus;
  readonly providerReference?: string;
  readonly rawStatus?: string;
  readonly submittedAt: string;
}

export interface CanonicalProviderStatus {
  readonly providerPaymentId: string;
  readonly status: CanonicalProviderPaymentStatus;
  readonly rawStatus: string;
  readonly updatedAt: string;
  readonly failureReason?: string;
}

export interface WebhookVerificationInput {
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly rawBody: string | Buffer;
  readonly timestamp?: string;
}

export interface WebhookVerificationResult {
  readonly valid: boolean;
  readonly eventId: string;
  readonly paymentId?: string;
  readonly status?: string;
}
