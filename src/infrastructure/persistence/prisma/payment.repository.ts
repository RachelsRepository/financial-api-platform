import { Injectable } from '@nestjs/common';
import type { PaymentRepository } from '@application/ports/payment.repository';
import type { Payment } from '@domain/entities';
import { numberToBigint, toPayment } from './mappers';
import { getPrismaClient } from './prisma-transaction.context';
import { PrismaService } from './prisma.service';

@Injectable()
export class PrismaPaymentRepository implements PaymentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Payment | null> {
    const row = await getPrismaClient(this.prisma).payment.findUnique({ where: { id } });
    return row === null ? null : toPayment(row);
  }

  async findByProviderPaymentId(providerPaymentId: string): Promise<Payment | null> {
    const row = await getPrismaClient(this.prisma).payment.findFirst({
      where: { providerPaymentId },
    });
    return row === null ? null : toPayment(row);
  }

  async findByIdempotencyKey(clientId: string, idempotencyKey: string): Promise<Payment | null> {
    const row = await getPrismaClient(this.prisma).payment.findUnique({
      where: {
        clientId_idempotencyKey: {
          clientId,
          idempotencyKey,
        },
      },
    });
    return row === null ? null : toPayment(row);
  }

  async findSubmitted(limit: number): Promise<Payment[]> {
    const rows = await getPrismaClient(this.prisma).payment.findMany({
      where: { status: 'SUBMITTED', providerPaymentId: { not: null } },
      orderBy: { updatedAt: 'asc' },
      take: limit,
    });
    return rows.map((row) => toPayment(row));
  }

  async save(payment: Payment): Promise<void> {
    await getPrismaClient(this.prisma).payment.upsert({
      where: { id: payment.id },
      create: {
        id: payment.id,
        consentId: payment.consentId,
        clientId: payment.clientId,
        institutionId: payment.institutionId,
        userId: payment.userId,
        sourceAccountId: payment.sourceAccountId,
        amountMinor: numberToBigint(payment.amount.amountMinor),
        currency: payment.amount.currency,
        creditorName: payment.creditorName,
        creditorAccountRef: payment.creditorAccountRef,
        reference: payment.reference,
        status: payment.status,
        providerCode: payment.providerCode,
        providerPaymentId: payment.providerPaymentId,
        idempotencyKey: payment.idempotencyKey,
        failureReason: payment.failureReason,
        version: payment.version,
        authorizedAt: payment.authorizedAt,
        submittedAt: payment.submittedAt,
        settledAt: payment.settledAt,
        cancelledAt: payment.cancelledAt,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
      },
      update: {
        status: payment.status,
        providerPaymentId: payment.providerPaymentId,
        failureReason: payment.failureReason,
        version: payment.version,
        authorizedAt: payment.authorizedAt,
        submittedAt: payment.submittedAt,
        settledAt: payment.settledAt,
        cancelledAt: payment.cancelledAt,
        updatedAt: payment.updatedAt,
      },
    });
  }
}
