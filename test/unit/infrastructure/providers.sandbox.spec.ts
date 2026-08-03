import { describe, expect, it } from 'vitest';
import { SandboxProvider } from '../../../src/infrastructure/providers/sandbox/sandbox.provider';
import { IDS } from '../../helpers/mocks';

describe('SandboxProvider', () => {
  const provider = new SandboxProvider();

  const baseRequest = {
    paymentId: IDS.payment,
    amountMinor: 1500,
    currency: 'GBP',
    debtorAccountId: IDS.account,
    creditorAccountId: 'GB00DEMO00000000000001',
    creditorName: 'Utility Co',
    institutionId: IDS.institution,
    reference: 'INV-1001',
    idempotencyKey: 'idem-001',
  };

  it('derives deterministic payment ids', () => {
    const first = provider.derivePaymentId(baseRequest);
    const second = provider.derivePaymentId(baseRequest);
    expect(first).toBe(second);
    expect(first.startsWith('sbx_')).toBe(true);
  });

  it('returns status based on amount modulo', async () => {
    const result = await provider.submitPayment(baseRequest);

    expect(result.providerPaymentId).toMatch(/^sbx_/);
    expect(['accepted', 'pending', 'processing', 'completed']).toContain(result.status);
  });

  it('verifies sandbox webhook token', async () => {
    const body = JSON.stringify({ eventId: 'evt-1', paymentId: IDS.payment, status: 'completed' });
    const valid = await provider.verifyWebhook({
      headers: { 'x-sandbox-token': 'sandbox-local' },
      rawBody: body,
    });
    expect(valid.valid).toBe(true);

    const invalid = await provider.verifyWebhook({
      headers: { 'x-sandbox-token': 'wrong' },
      rawBody: body,
    });
    expect(invalid.valid).toBe(false);
  });
});
