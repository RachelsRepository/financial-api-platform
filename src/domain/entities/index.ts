import {
  AccountNotAuthorizedError,
  ConsentExpiredError,
  ConsentNotActiveError,
  ScopeNotGrantedError,
} from '../errors';
import {
  ConsentStatus,
  PaymentStatus,
  assertConsentTransition,
  assertPaymentTransition,
  isAccessGrantingConsent,
  isCancellable,
} from '../policies/state-machines';
import { type Money, type ScopeSet } from '../value-objects';

export interface Institution {
  id: string;
  code: string;
  name: string;
  country: string;
  providerCode: string;
  isActive: boolean;
  createdAt: Date;
}

export interface User {
  id: string;
  externalSubject: string;
  emailHash: string;
  displayName: string;
  institutionId: string;
  isActive: boolean;
  createdAt: Date;
}

export interface ClientApplication {
  id: string;
  clientId: string;
  name: string;
  clientSecretHash: string | null;
  grantTypes: ReadonlySet<string>;
  redirectUris: ReadonlySet<string>;
  allowedScopes: ScopeSet;
  tokenEndpointAuthMethod: string;
  requirePkce: boolean;
  requireMtls: boolean;
  isConfidential: boolean;
  isActive: boolean;
  createdAt: Date;
}

export interface Account {
  id: string;
  institutionId: string;
  userId: string;
  accountType: string;
  currency: string;
  displayName: string;
  maskedNumber: string;
  status: string;
  createdAt: Date;
}

export interface ConsentProps {
  id: string;
  userId: string;
  clientId: string;
  institutionId: string;
  requestedScopes: ScopeSet;
  purpose: string;
  status: ConsentStatus;
  authorizedAccountIds: ReadonlySet<string>;
  grantedScopes: ScopeSet | null;
  version: number;
  expiresAt: Date;
  authorizedAt: Date | null;
  activatedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class Consent {
  readonly id: string;
  readonly userId: string;
  readonly clientId: string;
  readonly institutionId: string;
  readonly requestedScopes: ScopeSet;
  readonly purpose: string;
  readonly expiresAt: Date;
  readonly createdAt: Date;

  status: ConsentStatus;
  authorizedAccountIds: ReadonlySet<string>;
  grantedScopes: ScopeSet | null;
  version: number;
  authorizedAt: Date | null;
  activatedAt: Date | null;
  revokedAt: Date | null;
  updatedAt: Date;

  constructor(props: ConsentProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.clientId = props.clientId;
    this.institutionId = props.institutionId;
    this.requestedScopes = props.requestedScopes;
    this.purpose = props.purpose;
    this.status = props.status;
    this.authorizedAccountIds = props.authorizedAccountIds;
    this.grantedScopes = props.grantedScopes;
    this.version = props.version;
    this.expiresAt = props.expiresAt;
    this.authorizedAt = props.authorizedAt;
    this.activatedAt = props.activatedAt;
    this.revokedAt = props.revokedAt;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(input: {
    id: string;
    userId: string;
    clientId: string;
    institutionId: string;
    requestedScopes: ScopeSet;
    purpose: string;
    expiresAt: Date;
    now?: Date;
  }): Consent {
    const now = input.now ?? new Date();
    return new Consent({
      id: input.id,
      userId: input.userId,
      clientId: input.clientId,
      institutionId: input.institutionId,
      requestedScopes: input.requestedScopes,
      purpose: input.purpose,
      status: ConsentStatus.DRAFT,
      authorizedAccountIds: new Set(),
      grantedScopes: null,
      version: 1,
      expiresAt: input.expiresAt,
      authorizedAt: null,
      activatedAt: null,
      revokedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  submitForAuthorization(now = new Date()): void {
    assertConsentTransition(this.status, ConsentStatus.AWAITING_AUTHORIZATION);
    this.status = ConsentStatus.AWAITING_AUTHORIZATION;
    this.updatedAt = now;
    this.version += 1;
  }

  authorize(input: { accountIds: Iterable<string>; grantedScopes: ScopeSet; now?: Date }): void {
    assertConsentTransition(this.status, ConsentStatus.AUTHORIZED);
    const reduced = input.grantedScopes.reduceTo(this.requestedScopes);
    if (reduced.size === 0) {
      throw new ScopeNotGrantedError(this.id, input.grantedScopes.asString());
    }
    const now = input.now ?? new Date();
    this.authorizedAccountIds = new Set(input.accountIds);
    this.grantedScopes = reduced;
    this.status = ConsentStatus.AUTHORIZED;
    this.authorizedAt = now;
    this.updatedAt = now;
    this.version += 1;
  }

  activate(now = new Date()): void {
    assertConsentTransition(this.status, ConsentStatus.ACTIVE);
    this.status = ConsentStatus.ACTIVE;
    this.activatedAt = now;
    this.updatedAt = now;
    this.version += 1;
  }

  revoke(now = new Date()): void {
    assertConsentTransition(this.status, ConsentStatus.REVOKED);
    this.status = ConsentStatus.REVOKED;
    this.revokedAt = now;
    this.updatedAt = now;
    this.version += 1;
  }

  expire(now = new Date()): void {
    assertConsentTransition(this.status, ConsentStatus.EXPIRED);
    this.status = ConsentStatus.EXPIRED;
    this.updatedAt = now;
    this.version += 1;
  }

  reject(now = new Date()): void {
    assertConsentTransition(this.status, ConsentStatus.REJECTED);
    this.status = ConsentStatus.REJECTED;
    this.updatedAt = now;
    this.version += 1;
  }

  isExpired(now = new Date()): boolean {
    return now >= this.expiresAt;
  }

  ensureAccess(input: { scope: string; accountId?: string; now?: Date }): void {
    const now = input.now ?? new Date();
    if (this.isExpired(now) || this.status === ConsentStatus.EXPIRED) {
      throw new ConsentExpiredError(this.id);
    }
    if (!isAccessGrantingConsent(this.status)) {
      throw new ConsentNotActiveError(this.id, this.status);
    }
    if (!this.grantedScopes?.contains(input.scope)) {
      throw new ScopeNotGrantedError(this.id, input.scope);
    }
    if (input.accountId !== undefined && !this.authorizedAccountIds.has(input.accountId)) {
      throw new AccountNotAuthorizedError(this.id, input.accountId);
    }
  }
}

export interface PaymentProps {
  id: string;
  consentId: string;
  clientId: string;
  institutionId: string;
  userId: string;
  sourceAccountId: string;
  amount: Money;
  creditorName: string;
  creditorAccountRef: string;
  reference: string;
  status: PaymentStatus;
  providerCode: string;
  providerPaymentId: string | null;
  idempotencyKey: string | null;
  failureReason: string | null;
  version: number;
  authorizedAt: Date | null;
  submittedAt: Date | null;
  settledAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class Payment {
  readonly id: string;
  readonly consentId: string;
  readonly clientId: string;
  readonly institutionId: string;
  readonly userId: string;
  readonly sourceAccountId: string;
  readonly amount: Money;
  readonly creditorName: string;
  readonly creditorAccountRef: string;
  readonly reference: string;
  readonly providerCode: string;
  readonly idempotencyKey: string | null;
  readonly createdAt: Date;

  status: PaymentStatus;
  providerPaymentId: string | null;
  failureReason: string | null;
  version: number;
  authorizedAt: Date | null;
  submittedAt: Date | null;
  settledAt: Date | null;
  cancelledAt: Date | null;
  updatedAt: Date;

  constructor(props: PaymentProps) {
    this.id = props.id;
    this.consentId = props.consentId;
    this.clientId = props.clientId;
    this.institutionId = props.institutionId;
    this.userId = props.userId;
    this.sourceAccountId = props.sourceAccountId;
    this.amount = props.amount;
    this.creditorName = props.creditorName;
    this.creditorAccountRef = props.creditorAccountRef;
    this.reference = props.reference;
    this.status = props.status;
    this.providerCode = props.providerCode;
    this.providerPaymentId = props.providerPaymentId;
    this.idempotencyKey = props.idempotencyKey;
    this.failureReason = props.failureReason;
    this.version = props.version;
    this.authorizedAt = props.authorizedAt;
    this.submittedAt = props.submittedAt;
    this.settledAt = props.settledAt;
    this.cancelledAt = props.cancelledAt;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(input: {
    id: string;
    consentId: string;
    clientId: string;
    institutionId: string;
    userId: string;
    sourceAccountId: string;
    amount: Money;
    creditorName: string;
    creditorAccountRef: string;
    reference: string;
    providerCode: string;
    idempotencyKey?: string;
    now?: Date;
  }): Payment {
    const now = input.now ?? new Date();
    return new Payment({
      id: input.id,
      consentId: input.consentId,
      clientId: input.clientId,
      institutionId: input.institutionId,
      userId: input.userId,
      sourceAccountId: input.sourceAccountId,
      amount: input.amount,
      creditorName: input.creditorName,
      creditorAccountRef: input.creditorAccountRef,
      reference: input.reference,
      status: PaymentStatus.CREATED,
      providerCode: input.providerCode,
      providerPaymentId: null,
      idempotencyKey: input.idempotencyKey ?? null,
      failureReason: null,
      version: 1,
      authorizedAt: null,
      submittedAt: null,
      settledAt: null,
      cancelledAt: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  requestAuthorization(now = new Date()): void {
    assertPaymentTransition(this.status, PaymentStatus.AWAITING_AUTHORIZATION);
    this.status = PaymentStatus.AWAITING_AUTHORIZATION;
    this.updatedAt = now;
    this.version += 1;
  }

  authorize(now = new Date()): void {
    assertPaymentTransition(this.status, PaymentStatus.AUTHORIZED);
    this.status = PaymentStatus.AUTHORIZED;
    this.authorizedAt = now;
    this.updatedAt = now;
    this.version += 1;
  }

  submit(providerPaymentId: string, now = new Date()): void {
    assertPaymentTransition(this.status, PaymentStatus.SUBMITTED);
    this.status = PaymentStatus.SUBMITTED;
    this.providerPaymentId = providerPaymentId;
    this.submittedAt = now;
    this.updatedAt = now;
    this.version += 1;
  }

  applyProviderStatus(target: PaymentStatus, reason?: string, now = new Date()): void {
    assertPaymentTransition(this.status, target);
    this.status = target;
    this.failureReason = reason ?? null;
    if (target === PaymentStatus.SETTLED) {
      this.settledAt = now;
    }
    this.updatedAt = now;
    this.version += 1;
  }

  cancel(now = new Date()): void {
    if (!isCancellable(this.status)) {
      assertPaymentTransition(this.status, PaymentStatus.CANCELLED);
    }
    assertPaymentTransition(this.status, PaymentStatus.CANCELLED);
    this.status = PaymentStatus.CANCELLED;
    this.cancelledAt = now;
    this.updatedAt = now;
    this.version += 1;
  }
}

export interface RefreshTokenFamily {
  id: string;
  clientId: string;
  userId: string;
  consentId: string;
  currentTokenHash: string;
  scopes: ScopeSet;
  expiresAt: Date;
  revokedAt: Date | null;
  reuseDetectedAt: Date | null;
  generation: number;
  createdAt: Date;
}

export function isFamilyRevoked(family: RefreshTokenFamily): boolean {
  return family.revokedAt !== null || family.reuseDetectedAt !== null;
}
