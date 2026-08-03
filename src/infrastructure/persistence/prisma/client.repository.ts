import { Injectable } from '@nestjs/common';
import type { ClientRepository } from '@application/ports/client.repository';
import type { ClientApplication } from '@domain/entities';
import { toClientApplication } from './mappers';
import { getPrismaClient } from './prisma-transaction.context';
import { PrismaService } from './prisma.service';

const CLIENT_INCLUDE = {
  redirectUris: true,
} as const;

@Injectable()
export class PrismaClientRepository implements ClientRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<ClientApplication | null> {
    const row = await getPrismaClient(this.prisma).clientApplication.findUnique({
      where: { id },
      include: CLIENT_INCLUDE,
    });
    return row === null ? null : toClientApplication(row);
  }

  async findByClientId(clientId: string): Promise<ClientApplication | null> {
    const row = await getPrismaClient(this.prisma).clientApplication.findUnique({
      where: { clientId },
      include: CLIENT_INCLUDE,
    });
    return row === null ? null : toClientApplication(row);
  }
}
