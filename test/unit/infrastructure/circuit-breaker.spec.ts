import { describe, expect, it, vi } from 'vitest';
import {
  CircuitBreaker,
  CircuitOpenError,
} from '../../../src/infrastructure/resilience/circuit-breaker';

describe('CircuitBreaker', () => {
  it('opens after failure threshold', async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 1000 });
    const failing = vi.fn(async () => {
      throw new Error('upstream failure');
    });

    await expect(breaker.execute(failing)).rejects.toThrow('upstream failure');
    await expect(breaker.execute(failing)).rejects.toThrow('upstream failure');
    expect(breaker.getState()).toBe('open');

    await expect(breaker.execute(failing)).rejects.toThrow(CircuitOpenError);
    expect(failing).toHaveBeenCalledTimes(2);
  });

  it('resets after successful half-open probe', async () => {
    vi.useFakeTimers();
    const breaker = new CircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 100,
      halfOpenSuccessThreshold: 1,
    });

    await expect(
      breaker.execute(async () => {
        throw new Error('fail');
      }),
    ).rejects.toThrow('fail');
    expect(breaker.getState()).toBe('open');

    vi.advanceTimersByTime(150);
    await expect(breaker.execute(async () => 'ok')).resolves.toBe('ok');
    expect(breaker.getState()).toBe('closed');
    vi.useRealTimers();
  });
});
