import { Injectable } from '@nestjs/common';
import { sha256Hex } from '@infrastructure/security/hashing';
import { ScopeSet } from '@domain/value-objects';
import type {
  AccessTokenRecord,
  AuthorizationCodeRecord,
  AuthorizationRequestRecord,
  TokenRepository,
} from '@application/ports/token.repository';
import type { RefreshTokenFamily } from '@domain/entities';
import { toRefreshTokenFamily } from './mappers';
import { getPrismaClient } from './prisma-transaction.context';
import { PrismaService } from './prisma.service';

@Injectable()
export class PrismaTokenRepository implements TokenRepository {
  constructor(private readonly prisma: PrismaService) {}

  async saveAuthorizationRequest(record: AuthorizationRequestRecord): Promise<void> {
    await getPrismaClient(this.prisma).authorizationRequest.create({
      data: {
        id: record.id,
        clientId: record.clientId,
        consentId: record.consentId,
        redirectUri: record.redirectUri,
        scopes: record.scopes.toArray(),
        state: record.state,
        nonce: record.nonce,
        codeChallenge: record.codeChallenge,
        codeChallengeMethod: record.codeChallengeMethod,
        expiresAt: record.expiresAt,
        consumedAt: record.consumedAt,
        createdAt: record.createdAt,
      },
    });
  }

  async findOpenAuthorizationRequestByConsentId(
    consentId: string,
  ): Promise<AuthorizationRequestRecord | null> {
    const row = await getPrismaClient(this.prisma).authorizationRequest.findFirst({
      where: { consentId, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (row === null) {
      return null;
    }
    return {
      id: row.id,
      clientId: row.clientId,
      consentId: row.consentId ?? consentId,
      redirectUri: row.redirectUri,
      scopes: ScopeSet.fromIterable(row.scopes),
      state: row.state,
      nonce: row.nonce,
      codeChallenge: row.codeChallenge,
      codeChallengeMethod: row.codeChallengeMethod,
      expiresAt: row.expiresAt,
      consumedAt: row.consumedAt,
      createdAt: row.createdAt,
    };
  }

  async markAuthorizationRequestConsumed(id: string, consumedAt: Date): Promise<void> {
    await getPrismaClient(this.prisma).authorizationRequest.update({
      where: { id },
      data: { consumedAt },
    });
  }

  async saveAuthorizationCode(record: AuthorizationCodeRecord): Promise<void> {
    const codeHash = sha256Hex(record.code);
    await getPrismaClient(this.prisma).authorizationCode.create({
      data: {
        codeHash,
        clientId: record.clientId,
        userId: record.userId,
        consentId: record.consentId,
        redirectUri: record.redirectUri,
        scopes: record.scopes.toArray(),
        codeChallenge: record.codeChallenge ?? '',
        codeChallengeMethod: record.codeChallengeMethod ?? 'S256',
        nonce: record.nonce,
        expiresAt: record.expiresAt,
        usedAt: record.usedAt,
        createdAt: record.createdAt,
      },
    });
  }

  async findAuthorizationCode(code: string): Promise<AuthorizationCodeRecord | null> {
    const codeHash = sha256Hex(code);
    const row = await getPrismaClient(this.prisma).authorizationCode.findUnique({
      where: { codeHash },
    });

    if (row === null) {
      return null;
    }

    return {
      code,
      clientId: row.clientId,
      userId: row.userId,
      consentId: row.consentId,
      redirectUri: row.redirectUri,
      scopes: ScopeSet.fromIterable(row.scopes),
      codeChallenge: row.codeChallenge.length > 0 ? row.codeChallenge : null,
      codeChallengeMethod: row.codeChallengeMethod,
      nonce: row.nonce,
      expiresAt: row.expiresAt,
      usedAt: row.usedAt,
      createdAt: row.createdAt,
    };
  }

  async markAuthorizationCodeUsed(code: string, usedAt: Date): Promise<void> {
    const codeHash = sha256Hex(code);
    await getPrismaClient(this.prisma).authorizationCode.update({
      where: { codeHash },
      data: { usedAt },
    });
  }

  async saveAccessToken(record: AccessTokenRecord): Promise<void> {
    await getPrismaClient(this.prisma).accessTokenRecord.create({
      data: {
        id: record.tokenId,
        jti: record.tokenHash,
        clientId: record.clientId,
        userId: record.userId,
        consentId: record.consentId,
        scopes: record.scopes.toArray(),
        expiresAt: record.expiresAt,
        revokedAt: record.revokedAt,
        createdAt: record.createdAt,
      },
    });
  }

  async findAccessTokenByHash(tokenHash: string): Promise<AccessTokenRecord | null> {
    return this.findAccessTokenByJti(tokenHash);
  }

  async findAccessTokenByJti(jti: string): Promise<AccessTokenRecord | null> {
    const row = await getPrismaClient(this.prisma).accessTokenRecord.findUnique({
      where: { jti },
    });

    if (row === null) {
      return null;
    }

    const consent = await getPrismaClient(this.prisma).consent.findUnique({
      where: { id: row.consentId },
      select: { institutionId: true },
    });

    return {
      tokenId: row.id,
      tokenHash: row.jti,
      clientId: row.clientId,
      userId: row.userId,
      consentId: row.consentId,
      institutionId: consent?.institutionId ?? '',
      scopes: ScopeSet.fromIterable(row.scopes),
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt,
      createdAt: row.createdAt,
    };
  }

  async revokeAccessToken(tokenId: string, revokedAt: Date): Promise<void> {
    await getPrismaClient(this.prisma).accessTokenRecord.update({
      where: { id: tokenId },
      data: { revokedAt },
    });
  }

  async revokeAccessTokensForConsent(consentId: string, revokedAt: Date): Promise<void> {
    await getPrismaClient(this.prisma).accessTokenRecord.updateMany({
      where: { consentId, revokedAt: null },
      data: { revokedAt },
    });
  }

  async saveRefreshTokenFamily(family: RefreshTokenFamily): Promise<void> {
    const client = getPrismaClient(this.prisma);
    await client.refreshTokenFamily.create({
      data: {
        id: family.id,
        clientId: family.clientId,
        userId: family.userId,
        consentId: family.consentId,
        currentTokenHash: family.currentTokenHash,
        scopes: family.scopes.toArray(),
        expiresAt: family.expiresAt,
        revokedAt: family.revokedAt,
        reuseDetectedAt: family.reuseDetectedAt,
        generation: family.generation,
        createdAt: family.createdAt,
      },
    });
    await client.refreshToken.create({
      data: {
        familyId: family.id,
        tokenHash: family.currentTokenHash,
        generation: family.generation,
        expiresAt: family.expiresAt,
      },
    });
  }

  async findRefreshTokenFamilyById(familyId: string): Promise<RefreshTokenFamily | null> {
    const row = await getPrismaClient(this.prisma).refreshTokenFamily.findUnique({
      where: { id: familyId },
    });
    return row === null ? null : toRefreshTokenFamily(row);
  }

  async findRefreshTokenFamilyByHash(tokenHash: string): Promise<RefreshTokenFamily | null> {
    const client = getPrismaClient(this.prisma);
    const byCurrent = await client.refreshTokenFamily.findFirst({
      where: { currentTokenHash: tokenHash },
    });
    if (byCurrent !== null) {
      return toRefreshTokenFamily(byCurrent);
    }

    const historical = await client.refreshToken.findUnique({
      where: { tokenHash },
      include: { family: true },
    });
    return historical === null ? null : toRefreshTokenFamily(historical.family);
  }

  async rotateRefreshToken(
    familyId: string,
    newTokenHash: string,
    generation: number,
    expiresAt: Date,
  ): Promise<void> {
    const client = getPrismaClient(this.prisma);
    const family = await client.refreshTokenFamily.findUnique({ where: { id: familyId } });
    if (family !== null) {
      await client.refreshToken.updateMany({
        where: {
          familyId,
          tokenHash: family.currentTokenHash,
          usedAt: null,
        },
        data: { usedAt: new Date() },
      });
    }

    await client.refreshTokenFamily.update({
      where: { id: familyId },
      data: {
        currentTokenHash: newTokenHash,
        generation,
        expiresAt,
      },
    });

    await client.refreshToken.create({
      data: {
        familyId,
        tokenHash: newTokenHash,
        generation,
        expiresAt,
      },
    });
  }

  async revokeRefreshTokenFamily(familyId: string, revokedAt: Date): Promise<void> {
    await getPrismaClient(this.prisma).refreshTokenFamily.update({
      where: { id: familyId },
      data: { revokedAt },
    });
  }

  async markReuseDetected(familyId: string, detectedAt: Date): Promise<void> {
    await getPrismaClient(this.prisma).refreshTokenFamily.update({
      where: { id: familyId },
      data: { reuseDetectedAt: detectedAt, revokedAt: detectedAt },
    });
  }

  async revokeRefreshTokenFamiliesForConsent(consentId: string, revokedAt: Date): Promise<void> {
    await getPrismaClient(this.prisma).refreshTokenFamily.updateMany({
      where: { consentId, revokedAt: null },
      data: { revokedAt },
    });
  }
}
