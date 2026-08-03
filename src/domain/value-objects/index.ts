import { InvalidMoneyError } from '../errors';

export type Currency = 'USD' | 'EUR' | 'GBP' | 'CAD' | 'AUD' | 'JPY';

const CURRENCY_MINOR_UNITS: Record<Currency, number> = {
  USD: 2,
  EUR: 2,
  GBP: 2,
  CAD: 2,
  AUD: 2,
  JPY: 0,
};

const SUPPORTED_CURRENCIES = new Set<string>(Object.keys(CURRENCY_MINOR_UNITS));

export function isCurrency(value: string): value is Currency {
  return SUPPORTED_CURRENCIES.has(value);
}

/**
 * Monetary amount stored exclusively in integer minor units.
 * Never use floating-point arithmetic for money.
 */
export class Money {
  readonly amountMinor: number;
  readonly currency: Currency;

  private constructor(amountMinor: number, currency: Currency) {
    if (!Number.isInteger(amountMinor)) {
      throw new InvalidMoneyError('amountMinor must be an integer');
    }
    if (amountMinor < 0) {
      throw new InvalidMoneyError('amountMinor must be non-negative');
    }
    this.amountMinor = amountMinor;
    this.currency = currency;
  }

  static of(amountMinor: number, currency: string): Money {
    if (!isCurrency(currency)) {
      throw new InvalidMoneyError(`Unsupported currency: ${currency}`);
    }
    return new Money(amountMinor, currency);
  }

  static fromMajor(amount: string, currency: string): Money {
    if (!isCurrency(currency)) {
      throw new InvalidMoneyError(`Unsupported currency: ${currency}`);
    }
    const decimals = CURRENCY_MINOR_UNITS[currency];
    if (!/^-?\d+(\.\d+)?$/.test(amount)) {
      throw new InvalidMoneyError('Invalid major-unit amount format');
    }
    const [whole = '0', fraction = ''] = amount.split('.');
    if (fraction.length > decimals) {
      throw new InvalidMoneyError(`Amount has too many decimal places for ${currency}`);
    }
    const padded = fraction.padEnd(decimals, '0');
    const sign = whole.startsWith('-') ? -1 : 1;
    const absWhole = whole.replace('-', '');
    const minor =
      sign * (Number.parseInt(absWhole, 10) * 10 ** decimals + Number.parseInt(padded || '0', 10));
    if (minor < 0) {
      throw new InvalidMoneyError('amountMinor must be non-negative');
    }
    return new Money(minor, currency);
  }

  toMajorString(): string {
    const decimals = CURRENCY_MINOR_UNITS[this.currency];
    if (decimals === 0) {
      return String(this.amountMinor);
    }
    const abs = Math.abs(this.amountMinor);
    const whole = Math.floor(abs / 10 ** decimals);
    const frac = String(abs % 10 ** decimals).padStart(decimals, '0');
    return `${whole}.${frac}`;
  }

  add(other: Money): Money {
    if (this.currency !== other.currency) {
      throw new InvalidMoneyError('Cannot add money with different currencies');
    }
    return new Money(this.amountMinor + other.amountMinor, this.currency);
  }

  subtract(other: Money): Money {
    if (this.currency !== other.currency) {
      throw new InvalidMoneyError('Cannot subtract money with different currencies');
    }
    const result = this.amountMinor - other.amountMinor;
    if (result < 0) {
      throw new InvalidMoneyError('Resulting amount would be negative');
    }
    return new Money(result, this.currency);
  }

  equals(other: Money): boolean {
    return this.amountMinor === other.amountMinor && this.currency === other.currency;
  }
}

const SCOPE_PATTERN = /^[a-z0-9_.:/-]+$/;

export class ScopeSet {
  readonly scopes: ReadonlySet<string>;

  private constructor(scopes: ReadonlySet<string>) {
    for (const scope of scopes) {
      if (!SCOPE_PATTERN.test(scope)) {
        throw new Error(`Invalid scope format: ${scope}`);
      }
    }
    this.scopes = scopes;
  }

  static fromString(value: string): ScopeSet {
    const parts = value.split(/\s+/).filter(Boolean);
    return new ScopeSet(new Set(parts));
  }

  static fromIterable(values: Iterable<string>): ScopeSet {
    return new ScopeSet(new Set(values));
  }

  static empty(): ScopeSet {
    return new ScopeSet(new Set());
  }

  contains(scope: string): boolean {
    return this.scopes.has(scope);
  }

  containsAll(required: ScopeSet): boolean {
    for (const scope of required.scopes) {
      if (!this.scopes.has(scope)) {
        return false;
      }
    }
    return true;
  }

  reduceTo(allowed: ScopeSet): ScopeSet {
    const reduced = new Set<string>();
    for (const scope of this.scopes) {
      if (allowed.scopes.has(scope)) {
        reduced.add(scope);
      }
    }
    return new ScopeSet(reduced);
  }

  asString(): string {
    return [...this.scopes].sort().join(' ');
  }

  toArray(): string[] {
    return [...this.scopes].sort();
  }

  get size(): number {
    return this.scopes.size;
  }
}

export const SCOPES = {
  ACCOUNTS_READ: 'accounts:read',
  BALANCES_READ: 'balances:read',
  TRANSACTIONS_READ: 'transactions:read',
  BENEFICIARIES_READ: 'beneficiaries:read',
  PAYMENTS_WRITE: 'payments:write',
  PAYMENTS_READ: 'payments:read',
  OPENID: 'openid',
  OFFLINE_ACCESS: 'offline_access',
  CONSENT_MANAGE: 'consent:manage',
} as const;

export const AIS_SCOPES = new Set([
  SCOPES.ACCOUNTS_READ,
  SCOPES.BALANCES_READ,
  SCOPES.TRANSACTIONS_READ,
  SCOPES.BENEFICIARIES_READ,
]);

export const PIS_SCOPES = new Set([SCOPES.PAYMENTS_WRITE, SCOPES.PAYMENTS_READ]);
