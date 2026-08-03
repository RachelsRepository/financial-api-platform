import { describe, expect, it } from 'vitest';
import { InvalidMoneyError } from '../../../src/domain/errors';
import { Money } from '../../../src/domain/value-objects';

describe('Money', () => {
  it('creates from minor units', () => {
    const money = Money.of(1999, 'USD');
    expect(money.amountMinor).toBe(1999);
    expect(money.currency).toBe('USD');
  });

  it('parses major unit strings', () => {
    expect(Money.fromMajor('19.99', 'USD').amountMinor).toBe(1999);
    expect(Money.fromMajor('100', 'JPY').amountMinor).toBe(100);
    expect(Money.fromMajor('0.50', 'GBP').amountMinor).toBe(50);
  });

  it('formats major unit strings', () => {
    expect(Money.of(1999, 'USD').toMajorString()).toBe('19.99');
    expect(Money.of(100, 'JPY').toMajorString()).toBe('100');
  });

  it('adds and subtracts same currency', () => {
    const left = Money.of(1000, 'EUR');
    const right = Money.of(250, 'EUR');
    expect(left.add(right).amountMinor).toBe(1250);
    expect(left.subtract(right).amountMinor).toBe(750);
  });

  it('rejects invalid values', () => {
    expect(() => Money.of(1.5, 'USD')).toThrow(InvalidMoneyError);
    expect(() => Money.of(-1, 'USD')).toThrow(InvalidMoneyError);
    expect(() => Money.of(1, 'XYZ')).toThrow(InvalidMoneyError);
    expect(() => Money.fromMajor('19.999', 'USD')).toThrow(InvalidMoneyError);
    expect(() => Money.fromMajor('not-a-number', 'USD')).toThrow(InvalidMoneyError);
  });

  it('rejects cross-currency arithmetic', () => {
    const usd = Money.of(100, 'USD');
    const eur = Money.of(100, 'EUR');
    expect(() => usd.add(eur)).toThrow(InvalidMoneyError);
    expect(() => usd.subtract(eur)).toThrow(InvalidMoneyError);
  });

  it('rejects negative subtraction results', () => {
    const left = Money.of(100, 'USD');
    const right = Money.of(200, 'USD');
    expect(() => left.subtract(right)).toThrow(InvalidMoneyError);
  });

  it('compares equality', () => {
    expect(Money.of(100, 'USD').equals(Money.of(100, 'USD'))).toBe(true);
    expect(Money.of(100, 'USD').equals(Money.of(101, 'USD'))).toBe(false);
  });
});
