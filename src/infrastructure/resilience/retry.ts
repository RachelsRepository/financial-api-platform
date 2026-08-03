export interface RetryOptions {
  readonly maxAttempts: number;
  readonly initialDelayMs: number;
  readonly maxDelayMs: number;
  readonly jitterRatio?: number;
  readonly retryable?: (error: unknown) => boolean;
}

export class NonRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableError';
  }
}

const DEFAULT_RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

export function isRetryableHttpError(error: unknown): boolean {
  if (error instanceof NonRetryableError) {
    return false;
  }

  if (typeof error === 'object' && error !== null && 'statusCode' in error) {
    const statusCode = (error as { statusCode: number }).statusCode;
    if (typeof statusCode === 'number') {
      return DEFAULT_RETRYABLE_STATUS_CODES.has(statusCode);
    }
  }

  if (error instanceof Error) {
    const retryableCodes = ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN'];
    if ('code' in error && typeof error.code === 'string') {
      return retryableCodes.includes(error.code);
    }
    return true;
  }

  return false;
}

function computeDelayMs(attempt: number, options: RetryOptions): number {
  const exponential = Math.min(options.initialDelayMs * 2 ** (attempt - 1), options.maxDelayMs);
  const jitterRatio = options.jitterRatio ?? 0.2;
  const jitter = exponential * jitterRatio * Math.random();
  return Math.floor(exponential + jitter);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function withRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const shouldRetry = options.retryable ?? isRetryableHttpError;
  let lastError: unknown;

  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;

      if (attempt >= options.maxAttempts || !shouldRetry(error)) {
        throw error;
      }

      const delayMs = computeDelayMs(attempt, options);
      await sleep(delayMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Retry attempts exhausted');
}

export function classifyRetryable(error: unknown): 'retryable' | 'non_retryable' {
  return isRetryableHttpError(error) ? 'retryable' : 'non_retryable';
}
