import { type Account } from '../../domain/entities';

export interface AccountBalanceRecord {
  accountId: string;
  currency: string;
  availableMinor: number;
  currentMinor: number;
  asOf: Date;
}

export interface TransactionRecord {
  id: string;
  accountId: string;
  amountMinor: number;
  currency: string;
  direction: 'credit' | 'debit';
  description: string;
  bookedAt: Date;
}

export interface PaginatedTransactions {
  items: TransactionRecord[];
  nextCursor: string | null;
}

export interface BeneficiaryRecord {
  id: string;
  accountId: string;
  name: string;
  accountRef: string;
  bankCode: string;
}

export interface AccountRepository {
  findById(id: string): Promise<Account | null>;
  findByUserAndInstitution(userId: string, institutionId: string): Promise<Account[]>;
  findByIds(ids: ReadonlySet<string>): Promise<Account[]>;
  getBalances(accountId: string): Promise<AccountBalanceRecord[]>;
  listTransactions(
    accountId: string,
    options: { cursor?: string; limit: number },
  ): Promise<PaginatedTransactions>;
  listBeneficiaries(accountId: string): Promise<BeneficiaryRecord[]>;
}
