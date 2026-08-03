import { AsyncLocalStorage } from 'node:async_hooks';
import type { PrismaClient } from '@prisma/client';
import type { PrismaService } from './prisma.service';

export type PrismaTransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'
>;

const transactionStorage = new AsyncLocalStorage<PrismaTransactionClient>();

export function getPrismaClient(prisma: PrismaService): PrismaTransactionClient {
  return transactionStorage.getStore() ?? prisma;
}

export function runWithTransactionClient<T>(
  client: PrismaTransactionClient,
  work: () => Promise<T>,
): Promise<T> {
  return transactionStorage.run(client, work);
}
