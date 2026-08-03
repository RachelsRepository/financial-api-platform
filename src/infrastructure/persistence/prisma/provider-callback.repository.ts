import { Injectable } from '@nestjs/common';
import type {
  ProviderCallbackRecord,
  ProviderCallbackRepository,
} from '@application/ports/provider-callback.repository';
import { getPrismaClient } from './prisma-transaction.context';
import { PrismaService } from './prisma.service';

@Injectable()
export class PrismaProviderCallbackRepository implements ProviderCallbackRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByProviderEvent(
    providerCode: string,
    providerEventId: string,
  ): Promise<ProviderCallbackRecord | null> {
    const row = await getPrismaClient(this.prisma).providerCallback.findUnique({
      where: {
        providerCode_providerEventId: { providerCode, providerEventId },
      },
    });
    if (row === null) {
      return null;
    }
    return {
      id: row.id,
      providerCode: row.providerCode,
      providerEventId: row.providerEventId,
      paymentId: row.paymentId,
      payloadHash: row.payloadHash,
      signatureValid: row.signatureValid,
      processedAt: row.processedAt,
      createdAt: row.createdAt,
    };
  }

  async save(record: ProviderCallbackRecord): Promise<void> {
    await getPrismaClient(this.prisma).providerCallback.create({
      data: {
        id: record.id,
        providerCode: record.providerCode,
        providerEventId: record.providerEventId,
        paymentId: record.paymentId,
        payloadHash: record.payloadHash,
        signatureValid: record.signatureValid,
        processedAt: record.processedAt,
        createdAt: record.createdAt,
      },
    });
  }

  async markProcessed(id: string, processedAt: Date, paymentId: string | null): Promise<void> {
    await getPrismaClient(this.prisma).providerCallback.update({
      where: { id },
      data: { processedAt, paymentId },
    });
  }
}
