/** Domain errors — framework-free. */

export class DomainError extends Error {
  readonly code: string;

  constructor(message: string, code = 'domain_error') {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }
}

export class InvalidStateTransitionError extends DomainError {
  readonly entity: string;
  readonly current: string;
  readonly target: string;

  constructor(entity: string, current: string, target: string) {
    super(`Invalid ${entity} transition from ${current} to ${target}`, 'invalid_state_transition');
    this.entity = entity;
    this.current = current;
    this.target = target;
  }
}

export class ConsentError extends DomainError {}

export class ConsentExpiredError extends ConsentError {
  constructor(consentId: string) {
    super(`Consent ${consentId} has expired`, 'consent_expired');
  }
}

export class ConsentNotActiveError extends ConsentError {
  constructor(consentId: string, status: string) {
    super(`Consent ${consentId} is not active (status=${status})`, 'consent_not_active');
  }
}

export class AccountNotAuthorizedError extends ConsentError {
  constructor(consentId: string, accountId: string) {
    super(
      `Account ${accountId} is not authorized under consent ${consentId}`,
      'account_not_authorized',
    );
  }
}

export class ScopeNotGrantedError extends ConsentError {
  constructor(consentId: string, scope: string) {
    super(`Scope '${scope}' is not granted under consent ${consentId}`, 'scope_not_granted');
  }
}

export class OptimisticConcurrencyError extends DomainError {
  constructor(entity: string, id: string) {
    super(`Optimistic concurrency conflict on ${entity} ${id}`, 'optimistic_concurrency');
  }
}

export class PaymentError extends DomainError {}

export class InvalidMoneyError extends DomainError {
  constructor(message: string) {
    super(message, 'invalid_money');
  }
}

export class AuthorizationError extends DomainError {
  constructor(message: string, code = 'authorization_error') {
    super(message, code);
  }
}

export class TokenError extends DomainError {
  constructor(message: string, code = 'token_error') {
    super(message, code);
  }
}

export class TokenReuseDetectedError extends TokenError {
  readonly familyId: string;

  constructor(familyId: string) {
    super(`Refresh token reuse detected for family ${familyId}`, 'token_reuse_detected');
    this.familyId = familyId;
  }
}

export class IdempotencyConflictError extends DomainError {
  constructor(key: string) {
    super(`Idempotency key conflict for '${key}'`, 'idempotency_conflict');
  }
}
