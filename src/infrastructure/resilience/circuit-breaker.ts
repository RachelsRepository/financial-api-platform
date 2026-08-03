export type CircuitBreakerState = 'closed' | 'open' | 'half_open';

export interface CircuitBreakerOptions {
  readonly failureThreshold: number;
  readonly resetTimeoutMs: number;
  readonly halfOpenSuccessThreshold?: number;
}

export class CircuitOpenError extends Error {
  constructor(message = 'Circuit breaker is open') {
    super(message);
    this.name = 'CircuitOpenError';
  }
}

export class CircuitBreaker {
  private state: CircuitBreakerState = 'closed';
  private failureCount = 0;
  private successCount = 0;
  private openedAtMs: number | undefined;

  constructor(private readonly options: CircuitBreakerOptions) {}

  getState(): CircuitBreakerState {
    this.evaluateStateTransition();
    return this.state;
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    this.evaluateStateTransition();

    if (this.state === 'open') {
      throw new CircuitOpenError();
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  reset(): void {
    this.state = 'closed';
    this.failureCount = 0;
    this.successCount = 0;
    this.openedAtMs = undefined;
  }

  private evaluateStateTransition(): void {
    if (this.state !== 'open' || this.openedAtMs === undefined) {
      return;
    }

    if (Date.now() - this.openedAtMs >= this.options.resetTimeoutMs) {
      this.state = 'half_open';
      this.successCount = 0;
    }
  }

  private onSuccess(): void {
    if (this.state === 'half_open') {
      this.successCount += 1;
      const threshold = this.options.halfOpenSuccessThreshold ?? 1;
      if (this.successCount >= threshold) {
        this.reset();
      }
      return;
    }

    this.failureCount = 0;
  }

  private onFailure(): void {
    if (this.state === 'half_open') {
      this.trip();
      return;
    }

    this.failureCount += 1;
    if (this.failureCount >= this.options.failureThreshold) {
      this.trip();
    }
  }

  private trip(): void {
    this.state = 'open';
    this.openedAtMs = Date.now();
    this.failureCount = 0;
    this.successCount = 0;
  }
}
