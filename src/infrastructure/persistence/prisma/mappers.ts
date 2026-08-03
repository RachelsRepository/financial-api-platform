import type {
  Account as PrismaAccount,
  AccountBalance as PrismaAccountBalance,
  AccountTransaction as PrismaAccountTransaction,
  Beneficiary as PrismaBeneficiary,
  ClientApplication as PrismaClientApplication,
  ClientRedirectUri,
  Consent as PrismaConsent,
  ConsentScopeGrant,
  Institution as PrismaInstitution,
  Payment as PrismaPayment,
  RefreshTokenFamily as PrismaRefreshTokenFamily,
} from '@prisma/client';
import {
  type Account,
  type ClientApplication,
  Consent,
  type Institution,
  Payment,
  type RefreshTokenFamily,
} from '@domain/entities';
import { type ConsentStatus, type PaymentStatus } from '@domain/policies/state-machines';
import { Money, ScopeSet } from '@domain/value-objects';
import type {
  AccountBalanceRecord,
  BeneficiaryRecord,
  TransactionRecord,
} from '@application/ports/account.repository';

type ConsentWithRelations = PrismaConsent & {
  accounts: { accountId: string }[];
  scopes: ConsentScopeGrant[];
};

type ClientWithRelations = PrismaClientApplication & {
  redirectUris: ClientRedirectUri[];
};

export function bigintToNumber(value: bigint): number {
  const num = Number(value);
  if (!Number.isSafeInteger(num)) {
    throw new RangeError(`BigInt value ${value.toString()} exceeds safe integer range`);
  }
  return num;
}

export function numberToBigint(value: number): bigint {
  if (!Number.isInteger(value)) {
    throw new RangeError(`Expected integer minor units, received ${value}`);
  }
  return BigInt(value);
}

export function toInstitution(row: PrismaInstitution): Institution {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    country: row.country,
    providerCode: row.providerCode,
    isActive: row.isActive,
    createdAt: row.createdAt,
  };
}

export function toAccount(row: PrismaAccount): Account {
  return {
    id: row.id,
    institutionId: row.institutionId,
    userId: row.userId,
    accountType: row.accountType,
    currency: row.currency,
    displayName: row.displayName,
    maskedNumber: row.maskedNumber,
    status: row.status,
    createdAt: row.createdAt,
  };
}

export function toClientApplication(row: ClientWithRelations): ClientApplication {
  return {
    id: row.id,
    clientId: row.clientId,
    name: row.name,
    clientSecretHash: row.clientSecretHash,
    grantTypes: new Set(row.grantTypes),
    redirectUris: new Set(row.redirectUris.map((uri) => uri.uri)),
    allowedScopes: ScopeSet.fromIterable(row.allowedScopes),
    tokenEndpointAuthMethod: row.tokenEndpointAuthMethod,
    requirePkce: row.requirePkce,
    requireMtls: row.requireMtls,
    isConfidential: row.isConfidential,
    isActive: row.isActive,
    createdAt: row.createdAt,
  };
}

export function toConsent(row: ConsentWithRelations): Consent {
  const requestedScopes = ScopeSet.fromIterable(row.scopes.map((grant) => grant.scope));
  const grantedScopeValues = row.scopes
    .filter((grant) => grant.granted)
    .map((grant) => grant.scope);
  const grantedScopes =
    grantedScopeValues.length > 0 ? ScopeSet.fromIterable(grantedScopeValues) : null;

  return new Consent({
    id: row.id,
    userId: row.userId,
    clientId: row.clientId,
    institutionId: row.institutionId,
    requestedScopes,
    purpose: row.purpose,
    status: row.status as ConsentStatus,
    authorizedAccountIds: new Set(row.accounts.map((account) => account.accountId)),
    grantedScopes,
    version: row.version,
    expiresAt: row.expiresAt,
    authorizedAt: row.authorizedAt,
    activatedAt: row.activatedAt,
    revokedAt: row.revokedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export function toPayment(row: PrismaPayment): Payment {
  return new Payment({
    id: row.id,
    consentId: row.consentId,
    clientId: row.clientId,
    institutionId: row.institutionId,
    userId: row.userId,
    sourceAccountId: row.sourceAccountId,
    amount: Money.of(bigintToNumber(row.amountMinor), row.currency),
    creditorName: row.creditorName,
    creditorAccountRef: row.creditorAccountRef,
    reference: row.reference,
    status: row.status as PaymentStatus,
    providerCode: row.providerCode,
    providerPaymentId: row.providerPaymentId,
    idempotencyKey: row.idempotencyKey,
    failureReason: row.failureReason,
    version: row.version,
    authorizedAt: row.authorizedAt,
    submittedAt: row.submittedAt,
    settledAt: row.settledAt,
    cancelledAt: row.cancelledAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export function toRefreshTokenFamily(row: PrismaRefreshTokenFamily): RefreshTokenFamily {
  return {
    id: row.id,
    clientId: row.clientId,
    userId: row.userId,
    consentId: row.consentId,
    currentTokenHash: row.currentTokenHash,
    scopes: ScopeSet.fromIterable(row.scopes),
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    reuseDetectedAt: row.reuseDetectedAt,
    generation: row.generation,
    createdAt: row.createdAt,
  };
}

export function mergeBalanceRecords(balances: PrismaAccountBalance[]): AccountBalanceRecord[] {
  const byCurrency = new Map<string, AccountBalanceRecord>();

  for (const balance of balances) {
    const amountMinor = bigintToNumber(balance.amountMinor);
    const existing = byCurrency.get(balance.currency) ?? {
      accountId: balance.accountId,
      currency: balance.currency,
      availableMinor: 0,
      currentMinor: 0,
      asOf: balance.asOf,
    };

    if (balance.balanceType === 'available') {
      existing.availableMinor = amountMinor;
    } else if (balance.balanceType === 'current') {
      existing.currentMinor = amountMinor;
    }

    if (balance.asOf > existing.asOf) {
      existing.asOf = balance.asOf;
    }

    byCurrency.set(balance.currency, existing);
  }

  return [...byCurrency.values()];
}

export function toTransactionRecord(row: PrismaAccountTransaction): TransactionRecord {
  return {
    id: row.id,
    accountId: row.accountId,
    amountMinor: bigintToNumber(row.amountMinor),
    currency: row.currency,
    direction: row.creditDebit === 'credit' ? 'credit' : 'debit',
    description: row.description,
    bookedAt: row.bookingDate,
  };
}

export function toBeneficiaryRecord(row: PrismaBeneficiary): BeneficiaryRecord {
  return {
    id: row.id,
    accountId: row.accountId,
    name: row.name,
    accountRef: row.accountRefMasked,
    bankCode: '',
  };
}

export function consentScopeGrantRows(consent: Consent): { scope: string; granted: boolean }[] {
  const rows = new Map<string, boolean>();

  for (const scope of consent.requestedScopes.scopes) {
    rows.set(scope, consent.grantedScopes?.contains(scope) ?? false);
  }

  if (consent.grantedScopes !== null) {
    for (const scope of consent.grantedScopes.scopes) {
      rows.set(scope, true);
    }
  }

  return [...rows.entries()].map(([scope, granted]) => ({ scope, granted }));
}
