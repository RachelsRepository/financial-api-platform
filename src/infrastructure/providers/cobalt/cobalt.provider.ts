import { createHmac, randomUUID } from 'node:crypto';
import { timingSafeEqualString } from '@infrastructure/security/hashing';
import type { FinancialProvider } from '@infrastructure/providers/provider.port';
import type {
  CanonicalProviderPaymentRequest,
  CanonicalProviderPaymentResult,
  CanonicalProviderStatus,
  CanonicalProviderPaymentStatus,
  WebhookVerificationInput,
  WebhookVerificationResult,
} from '@infrastructure/providers/types';

export interface CobaltProviderConfig {
  readonly signingKey: string;
  readonly callbackSecret: string;
}

const REQUEST_SIGNATURE_HEADER = 'x-cobalt-request-signature';
const CALLBACK_SIGNATURE_HEADER = 'x-cobalt-callback-sig';

const COBALT_STATUS_MAP: Readonly<Record<string, CanonicalProviderPaymentStatus>> = {
  INIT: 'processing',
  HELD: 'pending',
  RELEASED: 'processing',
  POSTED: 'completed',
  RETURNED: 'failed',
  VOID: 'cancelled',
};

export class CobaltProvider implements FinancialProvider {
  readonly code = 'cobalt';

  constructor(private readonly config: CobaltProviderConfig) {}

  submitPayment(request: CanonicalProviderPaymentRequest): Promise<CanonicalProviderPaymentResult> {
    const providerPaymentId = `cbt_${randomUUID().replace(/-/g, '')}`;
    const payload = JSON.stringify({
      amount: request.amountMinor,
      currency: request.currency,
      reference: request.reference,
    });

    this.signRequest(payload);

    return Promise.resolve({
      providerPaymentId,
      status: 'processing',
      providerReference: request.reference,
      rawStatus: 'INIT',
      submittedAt: new Date().toISOString(),
    });
  }

  getPaymentStatus(providerPaymentId: string): Promise<CanonicalProviderStatus> {
    const rawStatus = providerPaymentId.endsWith('0') ? 'POSTED' : 'HELD';
    const status = COBALT_STATUS_MAP[rawStatus] ?? 'processing';

    return Promise.resolve({
      providerPaymentId,
      status,
      rawStatus,
      updatedAt: new Date().toISOString(),
    });
  }

  verifyWebhook(input: WebhookVerificationInput): Promise<WebhookVerificationResult> {
    const signature = this.readHeader(input.headers, CALLBACK_SIGNATURE_HEADER);
    if (!signature) {
      return Promise.resolve({ valid: false, eventId: '' });
    }

    const body = typeof input.rawBody === 'string' ? input.rawBody : input.rawBody.toString('utf8');
    const timestamp = input.timestamp ?? this.readHeader(input.headers, 'x-cobalt-timestamp') ?? '';
    const signedPayload = `${timestamp}.${body}`;
    const expected = createHmac('sha256', this.config.callbackSecret)
      .update(signedPayload, 'utf8')
      .digest('base64url');

    if (!timingSafeEqualString(signature, expected)) {
      return Promise.resolve({ valid: false, eventId: '' });
    }

    const payload = JSON.parse(body) as {
      eventId: string;
      paymentId?: string;
      cobaltStatus?: string;
    };

    const mappedStatus = payload.cobaltStatus ? COBALT_STATUS_MAP[payload.cobaltStatus] : undefined;

    return Promise.resolve({
      valid: true,
      eventId: payload.eventId,
      paymentId: payload.paymentId,
      status: mappedStatus ?? payload.cobaltStatus,
    });
  }

  signRequest(payload: string): string {
    return createHmac('sha256', this.config.signingKey).update(payload, 'utf8').digest('base64url');
  }

  buildSignedRequestHeaders(payload: string): Record<string, string> {
    return {
      [REQUEST_SIGNATURE_HEADER]: this.signRequest(payload),
      'Content-Type': 'application/json',
    };
  }

  signCallbackPayload(body: string, timestamp: string): string {
    return createHmac('sha256', this.config.callbackSecret)
      .update(`${timestamp}.${body}`, 'utf8')
      .digest('base64url');
  }

  mapCobaltStatus(rawStatus: string): CanonicalProviderPaymentStatus {
    return COBALT_STATUS_MAP[rawStatus] ?? 'processing';
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
