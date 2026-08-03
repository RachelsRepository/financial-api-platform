const SENSITIVE_KEY_PATTERN =
  /(password|secret|token|authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|code[_-]?verifier|code[_-]?challenge|private[_-]?key|account[_-]?number|iban|sort[_-]?code|routing[_-]?number|pan|cvv|cvc|ssn|social[_-]?security)/i;

const BEARER_PATTERN = /^Bearer\s+[A-Za-z0-9\-._~+/]+=*$/i;
const JWT_PATTERN = /^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+$/;
const ACCOUNT_NUMBER_PATTERN = /\b\d{8,17}\b/;

const REDACTED = '[REDACTED]';

function redactString(value: string): string {
  if (BEARER_PATTERN.test(value) || JWT_PATTERN.test(value)) {
    return REDACTED;
  }

  if (ACCOUNT_NUMBER_PATTERN.test(value)) {
    return value.replace(ACCOUNT_NUMBER_PATTERN, REDACTED);
  }

  return value;
}

function shouldRedactKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key);
}

export function redactForLogging<T>(value: T): T {
  return redactValue(value) as T;
}

function redactValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    return redactString(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item));
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      if (shouldRedactKey(key)) {
        result[key] = REDACTED;
      } else if (typeof nested === 'string') {
        result[key] = redactString(nested);
      } else {
        result[key] = redactValue(nested);
      }
    }
    return result;
  }

  return value;
}
