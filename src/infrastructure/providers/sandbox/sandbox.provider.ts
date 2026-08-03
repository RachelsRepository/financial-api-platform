import { sha256Hex } from '@infrastructure/security/hashing';
import type { FinancialProvider } from '@infrastructure/providers/provider.port';
import type {
  CanonicalProviderPaymentRequest,
  CanonicalProviderPaymentResult,
  CanonicalProviderPaymentStatus,
  CanonicalProviderStatus,
  WebhookVerificationInput,
  WebhookVerificationResult,
} from '@infrastructure/providers/types';

const SANDBOX_STATUSES: readonly CanonicalProviderPaymentStatus[] = [
  'accepted',
  'pending',
  'processing',
  'completed',
];

export class SandboxProvider implements FinancialProvider {
  readonly code = 'sandbox';

  submitPayment(request: CanonicalProviderPaymentRequest): Promise<CanonicalProviderPaymentResult> {
    const providerPaymentId = this.derivePaymentId(request);
    const status = this.initialStatus(request);

    return Promise.resolve({
      providerPaymentId,
      status,
      providerReference: request.reference,
      rawStatus: status.toUpperCase(),
      submittedAt: new Date().toISOString(),
    });
  }

  getPaymentStatus(providerPaymentId: string): Promise<CanonicalProviderStatus> {
    const status = this.statusFromPaymentId(providerPaymentId);

    return Promise.resolve({
      providerPaymentId,
      status,
      rawStatus: status.toUpperCase(),
      updatedAt: new Date().toISOString(),
    });
  }

  verifyWebhook(input: WebhookVerificationInput): Promise<WebhookVerificationResult> {
    const body = typeof input.rawBody === 'string' ? input.rawBody : input.rawBody.toString('utf8');
    const payload = JSON.parse(body) as {
      eventId: string;
      paymentId?: string;
      status?: string;
    };

    const sandboxToken = this.readHeader(input.headers, 'x-sandbox-token');
    if (sandboxToken !== 'sandbox-local') {
      return Promise.resolve({ valid: false, eventId: '' });
    }

    return Promise.resolve({
      valid: true,
      eventId: payload.eventId,
      paymentId: payload.paymentId,
      status: payload.status,
    });
  }

  derivePaymentId(request: CanonicalProviderPaymentRequest): string {
    const fingerprint = sha256Hex(
      [
        request.paymentId,
        request.amountMinor,
        request.currency,
        request.debtorAccountId,
        request.creditorAccountId,
        request.idempotencyKey,
      ].join('|'),
    );
    return `sbx_${fingerprint.slice(0, 32)}`;
  }

  private initialStatus(request: CanonicalProviderPaymentRequest): CanonicalProviderPaymentStatus {
    return SANDBOX_STATUSES[request.amountMinor % SANDBOX_STATUSES.length] ?? 'accepted';
  }

  private statusFromPaymentId(providerPaymentId: string): CanonicalProviderPaymentStatus {
    const lastChar = providerPaymentId.slice(-1);
    const index = Number.parseInt(lastChar, 16);
    if (Number.isNaN(index)) {
      return 'completed';
    }
    return SANDBOX_STATUSES[index % SANDBOX_STATUSES.length] ?? 'completed';
  }

  private readHeader(
    headers: Readonly<Record<string, string | string[] | undefined>>,
    name: string,
  ): string | undefined {
    const value = headers[name] ?? headers[name.toLowerCase()];
    if (Array.isArray(value)) {
      return value[0];
    }
    return value;
  }
}
