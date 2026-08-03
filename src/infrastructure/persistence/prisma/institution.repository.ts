import { Injectable } from '@nestjs/common';
import type { InstitutionRepository } from '@application/ports/institution.repository';
import type { Institution } from '@domain/entities';
import { toInstitution } from './mappers';
import { getPrismaClient } from './prisma-transaction.context';
import { PrismaService } from './prisma.service';

@Injectable()
export class PrismaInstitutionRepository implements InstitutionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Institution | null> {
    const row = await getPrismaClient(this.prisma).institution.findUnique({ where: { id } });
    return row === null ? null : toInstitution(row);
  }

  async findByCode(code: string): Promise<Institution | null> {
    const row = await getPrismaClient(this.prisma).institution.findUnique({ where: { code } });
    return row === null ? null : toInstitution(row);
  }

  async listActive(): Promise<Institution[]> {
    const rows = await getPrismaClient(this.prisma).institution.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
    return rows.map(toInstitution);
  }
}
