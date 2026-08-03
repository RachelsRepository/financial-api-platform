import { describe, expect, it } from 'vitest';
import { NorthstarProvider } from '../../../src/infrastructure/providers/northstar/northstar.provider';
import { MeridianProvider } from '../../../src/infrastructure/providers/meridian/meridian.provider';
import { IDS } from '../../helpers/mocks';

describe('Provider webhook signatures', () => {
  const northstar = new NorthstarProvider({
    apiKey: 'northstar-test-key',
    webhookSecret: 'northstar-webhook-secret',
  });

  const meridian = new MeridianProvider({
    clientId: 'meridian-client',
    clientSecret: 'meridian-secret',
    webhookSecret: 'meridian-webhook-secret',
  });

  it('verifies Northstar hex HMAC signatures', async () => {
    const body = JSON.stringify({
      event_id: 'evt-northstar-1',
      payment_id: IDS.payment,
      status: 'SETTLED',
    });
    const signature = northstar.signWebhookPayload(body);

    const valid = await northstar.verifyWebhook({
      headers: { 'x-northstar-signature': signature },
      rawBody: body,
    });
    expect(valid.valid).toBe(true);
    expect(valid.eventId).toBe('evt-northstar-1');

    const invalid = await northstar.verifyWebhook({
      headers: { 'x-northstar-signature': 'deadbeef' },
      rawBody: body,
    });
    expect(invalid.valid).toBe(false);
  });

  it('verifies Meridian base64 HMAC signatures', async () => {
    const body = JSON.stringify({
      id: 'evt-meridian-1',
      data: { paymentId: IDS.payment, status: 'CLEARED' },
    });
    const signature = meridian.signWebhookPayload(body);

    const valid = await meridian.verifyWebhook({
      headers: { 'x-meridian-signature': signature },
      rawBody: body,
    });
    expect(valid.valid).toBe(true);
    expect(valid.eventId).toBe('evt-meridian-1');

    const invalid = await meridian.verifyWebhook({
      headers: { 'x-meridian-signature': 'not-valid-base64-signature' },
      rawBody: body,
    });
    expect(invalid.valid).toBe(false);
  });
});
