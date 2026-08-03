import { Injectable } from '@nestjs/common';
import { AuditOutcome } from '@prisma/client';
import type { AuditEntry, AuditPort } from '@application/ports/audit.port';
import { getPrismaClient } from './prisma-transaction.context';
import { PrismaService } from './prisma.service';

@Injectable()
export class PrismaAuditRepository implements AuditPort {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    await getPrismaClient(this.prisma).auditEvent.create({
      data: {
        eventType: entry.action,
        actorType: entry.actorType,
        actorId: entry.actorId,
        subjectId: entry.resourceId,
        institutionId: entry.institutionId,
        outcome: AuditOutcome.SUCCESS,
        metadata: {
          resourceType: entry.resourceType,
          ...entry.metadata,
        },
        createdAt: entry.timestamp,
      },
    });
  }
}
