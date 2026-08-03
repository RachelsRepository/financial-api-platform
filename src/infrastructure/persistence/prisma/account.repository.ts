import { Injectable } from '@nestjs/common';
import type {
  AccountRepository,
  PaginatedTransactions,
} from '@application/ports/account.repository';
import type { Account } from '@domain/entities';
import {
  mergeBalanceRecords,
  toAccount,
  toBeneficiaryRecord,
  toTransactionRecord,
} from './mappers';
import { getPrismaClient } from './prisma-transaction.context';
import { PrismaService } from './prisma.service';

function encodeCursor(bookingDate: Date, id: string): string {
  return Buffer.from(`${bookingDate.toISOString()}:${id}`, 'utf8').toString('base64url');
}

function decodeCursor(cursor: string): { bookingDate: Date; id: string } {
  const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  const separatorIndex = decoded.indexOf(':');
  if (separatorIndex <= 0) {
    throw new Error('Invalid transaction cursor');
  }

  const bookingDate = new Date(decoded.slice(0, separatorIndex));
  const id = decoded.slice(separatorIndex + 1);

  if (Number.isNaN(bookingDate.getTime()) || id.length === 0) {
    throw new Error('Invalid transaction cursor');
  }

  return { bookingDate, id };
}

@Injectable()
export class PrismaAccountRepository implements AccountRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Account | null> {
    const row = await getPrismaClient(this.prisma).account.findUnique({ where: { id } });
    return row === null ? null : toAccount(row);
  }

  async findByUserAndInstitution(userId: string, institutionId: string): Promise<Account[]> {
    const rows = await getPrismaClient(this.prisma).account.findMany({
      where: { userId, institutionId, status: 'active' },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toAccount);
  }

  async findByIds(ids: ReadonlySet<string>): Promise<Account[]> {
    if (ids.size === 0) {
      return [];
    }

    const rows = await getPrismaClient(this.prisma).account.findMany({
      where: { id: { in: [...ids] } },
    });
    return rows.map(toAccount);
  }

  async getBalances(accountId: string) {
    const rows = await getPrismaClient(this.prisma).accountBalance.findMany({
      where: { accountId },
    });
    return mergeBalanceRecords(rows);
  }

  async listTransactions(
    accountId: string,
    options: { cursor?: string; limit: number },
  ): Promise<PaginatedTransactions> {
    const client = getPrismaClient(this.prisma);
    const cursorFilter =
      options.cursor !== undefined
        ? (() => {
            const decoded = decodeCursor(options.cursor);
            return {
              OR: [
                { bookingDate: { lt: decoded.bookingDate } },
                {
                  bookingDate: decoded.bookingDate,
                  id: { lt: decoded.id },
                },
              ],
            };
          })()
        : {};

    const rows = await client.accountTransaction.findMany({
      where: {
        accountId,
        ...cursorFilter,
      },
      orderBy: [{ bookingDate: 'desc' }, { id: 'desc' }],
      take: options.limit + 1,
    });

    const hasMore = rows.length > options.limit;
    const pageRows = hasMore ? rows.slice(0, options.limit) : rows;
    const lastRow = pageRows.at(-1);

    return {
      items: pageRows.map(toTransactionRecord),
      nextCursor:
        hasMore && lastRow !== undefined ? encodeCursor(lastRow.bookingDate, lastRow.id) : null,
    };
  }

  async listBeneficiaries(accountId: string) {
    const rows = await getPrismaClient(this.prisma).beneficiary.findMany({
      where: { accountId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toBeneficiaryRecord);
  }
}
