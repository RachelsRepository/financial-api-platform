import { createHmac, randomUUID } from 'node:crypto';
import { timingSafeEqualString } from '@infrastructure/security/hashing';
import type { FinancialProvider } from '@infrastructure/providers/provider.port';
import type {
  CanonicalProviderPaymentRequest,
  CanonicalProviderPaymentResult,
  CanonicalProviderStatus,
  WebhookVerificationInput,
  WebhookVerificationResult,
} from '@infrastructure/providers/types';

export interface NorthstarProviderConfig {
  readonly apiKey: string;
  readonly webhookSecret: string;
  readonly baseUrl?: string;
}

interface NorthstarSubmitResponse {
  readonly payment_id: string;
  readonly status: 'ACCEPTED';
  readonly reference: string;
}

const SIGNATURE_HEADER = 'x-northstar-signature';

export class NorthstarProvider implements FinancialProvider {
  readonly code = 'northstar';

  constructor(private readonly config: NorthstarProviderConfig) {}

  submitPayment(request: CanonicalProviderPaymentRequest): Promise<CanonicalProviderPaymentResult> {
    this.assertApiKeyConfigured();

    const providerPaymentId = `nst_${randomUUID().replace(/-/g, '')}`;
    const response: NorthstarSubmitResponse = {
      payment_id: providerPaymentId,
      status: 'ACCEPTED',
      reference: request.reference,
    };

    return Promise.resolve({
      providerPaymentId: response.payment_id,
      status: 'accepted',
      providerReference: response.reference,
      rawStatus: response.status,
      submittedAt: new Date().toISOString(),
    });
  }

  getPaymentStatus(providerPaymentId: string): Promise<CanonicalProviderStatus> {
    this.assertApiKeyConfigured();

    return Promise.resolve({
      providerPaymentId,
      status: 'completed',
      rawStatus: 'SETTLED',
      updatedAt: new Date().toISOString(),
    });
  }

  verifyWebhook(input: WebhookVerificationInput): Promise<WebhookVerificationResult> {
    const signature = this.readHeader(input.headers, SIGNATURE_HEADER);
    if (!signature) {
      return Promise.resolve({ valid: false, eventId: '' });
    }

    const body = typeof input.rawBody === 'string' ? input.rawBody : input.rawBody.toString('utf8');
    const expected = createHmac('sha256', this.config.webhookSecret)
      .update(body, 'utf8')
      .digest('hex');

    if (!timingSafeEqualString(signature, expected)) {
      return Promise.resolve({ valid: false, eventId: '' });
    }

    const payload = JSON.parse(body) as {
      event_id: string;
      payment_id?: string;
      status?: string;
    };

    return Promise.resolve({
      valid: true,
      eventId: payload.event_id,
      paymentId: payload.payment_id,
      status: payload.status,
    });
  }

  buildAuthHeaders(): Record<string, string> {
    return {
      'X-Api-Key': this.config.apiKey,
      'Content-Type': 'application/json',
    };
  }

  signWebhookPayload(body: string): string {
    return createHmac('sha256', this.config.webhookSecret).update(body, 'utf8').digest('hex');
  }

  private assertApiKeyConfigured(): void {
    if (!this.config.apiKey) {
      throw new Error('Northstar API key is not configured');
    }
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
