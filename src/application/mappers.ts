import { type Consent, type Payment, type Account, type Institution } from '../domain/entities';
import {
  type ConsentSummaryDto,
  type PaymentSummaryDto,
  type AccountSummaryDto,
  type InstitutionSummaryDto,
} from './dto/common.dto';

export function toConsentSummary(consent: Consent): ConsentSummaryDto {
  return {
    id: consent.id,
    status: consent.status,
    requestedScopes: consent.requestedScopes.toArray(),
    grantedScopes: consent.grantedScopes?.toArray() ?? null,
    authorizedAccountIds: [...consent.authorizedAccountIds],
    purpose: consent.purpose,
    expiresAt: consent.expiresAt,
    createdAt: consent.createdAt,
  };
}

export function toPaymentSummary(payment: Payment): PaymentSummaryDto {
  return {
    id: payment.id,
    status: payment.status,
    amountMinor: payment.amount.amountMinor,
    currency: payment.amount.currency,
    creditorName: payment.creditorName,
    reference: payment.reference,
    sourceAccountId: payment.sourceAccountId,
    providerPaymentId: payment.providerPaymentId,
    failureReason: payment.failureReason,
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt,
  };
}

export function toAccountSummary(account: Account): AccountSummaryDto {
  return {
    id: account.id,
    accountType: account.accountType,
    currency: account.currency,
    displayName: account.displayName,
    maskedNumber: account.maskedNumber,
    status: account.status,
  };
}

export function toInstitutionSummary(institution: Institution): InstitutionSummaryDto {
  return {
    id: institution.id,
    code: institution.code,
    name: institution.name,
    country: institution.country,
  };
}
