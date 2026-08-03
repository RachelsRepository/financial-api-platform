import { type AuthenticatedContext, type PaymentSummaryDto } from './common.dto';

export interface CreatePaymentCommand extends AuthenticatedContext {
  sourceAccountId: string;
  amountMinor: number;
  currency: string;
  creditorName: string;
  creditorAccountRef: string;
  reference: string;
  idempotencyKey?: string;
  correlationId?: string;
}

export interface CreatePaymentResult {
  payment: PaymentSummaryDto;
}

export interface AuthorizePaymentCommand {
  paymentId: string;
  actorUserId: string;
  correlationId?: string;
}

export interface AuthorizePaymentResult {
  payment: PaymentSummaryDto;
}

export interface SubmitPaymentCommand {
  paymentId: string;
  actorClientId: string;
  correlationId?: string;
}

export interface SubmitPaymentResult {
  payment: PaymentSummaryDto;
}

export interface GetPaymentCommand extends AuthenticatedContext {
  paymentId: string;
}

export interface GetPaymentResult {
  payment: PaymentSummaryDto;
}

export interface CancelPaymentCommand extends AuthenticatedContext {
  paymentId: string;
  correlationId?: string;
}

export interface CancelPaymentResult {
  payment: PaymentSummaryDto;
}

export interface ProcessProviderCallbackCommand {
  providerCode: string;
  headers: Record<string, string>;
  body: string;
  correlationId?: string;
}

export interface ProcessProviderCallbackResult {
  paymentId: string;
  status: string;
  processed: boolean;
}
