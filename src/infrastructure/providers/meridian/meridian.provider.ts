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

export interface MeridianProviderConfig {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly tokenUrl?: string;
  readonly webhookSecret: string;
}

interface MeridianTokenResponse {
  readonly access_token: string;
  readonly token_type: 'Bearer';
  readonly expires_in: number;
}

interface CachedToken {
  readonly accessToken: string;
  readonly expiresAtMs: number;
}

const SIGNATURE_HEADER = 'x-meridian-signature';

export class MeridianProvider implements FinancialProvider {
  readonly code = 'meridian';

  private cachedToken: CachedToken | undefined;

  constructor(private readonly config: MeridianProviderConfig) {}

  async submitPayment(
    request: CanonicalProviderPaymentRequest,
  ): Promise<CanonicalProviderPaymentResult> {
    await this.obtainAccessToken();

    const providerPaymentId = `mrd_${randomUUID().replace(/-/g, '')}`;

    return {
      providerPaymentId,
      status: 'pending',
      providerReference: request.reference,
      rawStatus: 'QUEUED',
      submittedAt: new Date().toISOString(),
    };
  }

  async getPaymentStatus(providerPaymentId: string): Promise<CanonicalProviderStatus> {
    await this.obtainAccessToken();

    const suffix = providerPaymentId.slice(-1);
    const numeric = Number.parseInt(suffix, 16);
    const status = Number.isNaN(numeric) || numeric % 2 === 0 ? 'completed' : 'processing';

    return {
      providerPaymentId,
      status,
      rawStatus: status === 'completed' ? 'CLEARED' : 'IN_FLIGHT',
      updatedAt: new Date().toISOString(),
    };
  }

  verifyWebhook(input: WebhookVerificationInput): Promise<WebhookVerificationResult> {
    const signature = this.readHeader(input.headers, SIGNATURE_HEADER);
    if (!signature) {
      return Promise.resolve({ valid: false, eventId: '' });
    }

    const body = typeof input.rawBody === 'string' ? input.rawBody : input.rawBody.toString('utf8');
    const expected = createHmac('sha256', this.config.webhookSecret)
      .update(body, 'utf8')
      .digest('base64');

    if (!timingSafeEqualString(signature, expected)) {
      return Promise.resolve({ valid: false, eventId: '' });
    }

    const payload = JSON.parse(body) as {
      id: string;
      data?: { paymentId?: string; status?: string };
    };

    return Promise.resolve({
      valid: true,
      eventId: payload.id,
      paymentId: payload.data?.paymentId,
      status: payload.data?.status,
    });
  }

  obtainAccessToken(): Promise<string> {
    if (this.cachedToken && this.cachedToken.expiresAtMs > Date.now() + 5_000) {
      return Promise.resolve(this.cachedToken.accessToken);
    }

    const token: MeridianTokenResponse = {
      access_token: `mrd_tok_${randomUUID().replace(/-/g, '')}`,
      token_type: 'Bearer',
      expires_in: 3600,
    };

    this.cachedToken = {
      accessToken: token.access_token,
      expiresAtMs: Date.now() + token.expires_in * 1000,
    };

    return Promise.resolve(token.access_token);
  }

  buildAuthHeaders(): Promise<Record<string, string>> {
    return this.obtainAccessToken().then((accessToken) => ({
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    }));
  }

  signWebhookPayload(body: string): string {
    return createHmac('sha256', this.config.webhookSecret).update(body, 'utf8').digest('base64');
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
