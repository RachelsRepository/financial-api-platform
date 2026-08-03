import { Injectable } from '@nestjs/common';
import { ConsentStatus } from '@domain/policies/state-machines';
import type { ConsentRepository } from '@application/ports/consent.repository';
import type { Consent } from '@domain/entities';
import { consentScopeGrantRows, toConsent } from './mappers';
import { getPrismaClient } from './prisma-transaction.context';
import { PrismaService } from './prisma.service';

const CONSENT_INCLUDE = {
  accounts: { select: { accountId: true } },
  scopes: true,
} as const;

@Injectable()
export class PrismaConsentRepository implements ConsentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Consent | null> {
    const row = await getPrismaClient(this.prisma).consent.findUnique({
      where: { id },
      include: CONSENT_INCLUDE,
    });
    return row === null ? null : toConsent(row);
  }

  async save(consent: Consent): Promise<void> {
    const client = getPrismaClient(this.prisma);
    const scopeRows = consentScopeGrantRows(consent);

    await client.consent.upsert({
      where: { id: consent.id },
      create: {
        id: consent.id,
        userId: consent.userId,
        clientId: consent.clientId,
        institutionId: consent.institutionId,
        purpose: consent.purpose,
        status: consent.status,
        version: consent.version,
        expiresAt: consent.expiresAt,
        authorizedAt: consent.authorizedAt,
        activatedAt: consent.activatedAt,
        revokedAt: consent.revokedAt,
        createdAt: consent.createdAt,
        updatedAt: consent.updatedAt,
        scopes: {
          create: scopeRows.map((scope) => ({
            scope: scope.scope,
            granted: scope.granted,
          })),
        },
        accounts: {
          create: [...consent.authorizedAccountIds].map((accountId) => ({ accountId })),
        },
      },
      update: {
        purpose: consent.purpose,
        status: consent.status,
        version: consent.version,
        expiresAt: consent.expiresAt,
        authorizedAt: consent.authorizedAt,
        activatedAt: consent.activatedAt,
        revokedAt: consent.revokedAt,
        updatedAt: consent.updatedAt,
      },
    });

    await client.consentScopeGrant.deleteMany({ where: { consentId: consent.id } });
    if (scopeRows.length > 0) {
      await client.consentScopeGrant.createMany({
        data: scopeRows.map((scope) => ({
          consentId: consent.id,
          scope: scope.scope,
          granted: scope.granted,
        })),
      });
    }

    await client.consentAccount.deleteMany({ where: { consentId: consent.id } });
    if (consent.authorizedAccountIds.size > 0) {
      await client.consentAccount.createMany({
        data: [...consent.authorizedAccountIds].map((accountId) => ({
          consentId: consent.id,
          accountId,
        })),
      });
    }
  }

  async findExpirable(before: Date, limit: number): Promise<Consent[]> {
    const rows = await getPrismaClient(this.prisma).consent.findMany({
      where: {
        expiresAt: { lte: before },
        status: {
          notIn: [ConsentStatus.REVOKED, ConsentStatus.EXPIRED, ConsentStatus.REJECTED],
        },
      },
      include: CONSENT_INCLUDE,
      orderBy: { expiresAt: 'asc' },
      take: limit,
    });

    return rows.map(toConsent);
  }
}
