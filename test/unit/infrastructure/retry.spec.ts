import { describe, expect, it, vi } from 'vitest';
import { NonRetryableError, withRetry } from '../../../src/infrastructure/resilience/retry';

describe('withRetry', () => {
  it('returns on first success', async () => {
    const operation = vi.fn(async () => 'ok');
    await expect(
      withRetry(operation, { maxAttempts: 3, initialDelayMs: 1, maxDelayMs: 5 }),
    ).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('retries retryable errors', async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce({ statusCode: 503 })
      .mockResolvedValueOnce('ok');

    await expect(
      withRetry(operation, { maxAttempts: 3, initialDelayMs: 1, maxDelayMs: 5 }),
    ).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-retryable errors', async () => {
    const operation = vi.fn(async () => {
      throw new NonRetryableError('bad request');
    });

    await expect(
      withRetry(operation, { maxAttempts: 3, initialDelayMs: 1, maxDelayMs: 5 }),
    ).rejects.toThrow(NonRetryableError);
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
