import { type AuthenticatedContext, type AccountSummaryDto } from './common.dto';

export type ListAccountsCommand = AuthenticatedContext;

export interface ListAccountsResult {
  accounts: AccountSummaryDto[];
}

export interface GetAccountCommand extends AuthenticatedContext {
  accountId: string;
}

export interface GetAccountResult {
  account: AccountSummaryDto;
}

export interface AccountBalanceDto {
  accountId: string;
  currency: string;
  availableMinor: number;
  currentMinor: number;
  asOf: Date;
}

export interface GetBalancesCommand extends AuthenticatedContext {
  accountId: string;
}

export interface GetBalancesResult {
  balances: AccountBalanceDto[];
}

export interface TransactionDto {
  id: string;
  accountId: string;
  amountMinor: number;
  currency: string;
  direction: 'credit' | 'debit';
  description: string;
  bookedAt: Date;
}

export interface ListTransactionsCommand extends AuthenticatedContext {
  accountId: string;
  cursor?: string;
  limit: number;
}

export interface ListTransactionsResult {
  transactions: TransactionDto[];
  nextCursor: string | null;
}

export interface BeneficiaryDto {
  id: string;
  accountId: string;
  name: string;
  accountRef: string;
  bankCode: string;
}

export interface ListBeneficiariesCommand extends AuthenticatedContext {
  accountId: string;
}

export interface ListBeneficiariesResult {
  beneficiaries: BeneficiaryDto[];
}
