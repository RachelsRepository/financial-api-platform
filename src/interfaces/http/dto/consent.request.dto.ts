import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class CreateConsentRequestDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  userId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  clientId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  institutionId!: string;

  @ApiProperty({ example: 'accounts:read balances:read payments:write' })
  @IsString()
  @IsNotEmpty()
  requestedScopes!: string;

  @ApiProperty({ example: 'Personal finance aggregation' })
  @IsString()
  @MinLength(3)
  purpose!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  @IsDateString()
  expiresAt!: string;
}

export class AuthorizeConsentRequestDto {
  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  accountIds!: string[];

  @ApiProperty({ example: 'accounts:read balances:read' })
  @IsString()
  @IsNotEmpty()
  grantedScopes!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  actorUserId!: string;
}

export class ActivateConsentRequestDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  actorUserId!: string;
}

export class RevokeConsentRequestDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  actorUserId!: string;
}
