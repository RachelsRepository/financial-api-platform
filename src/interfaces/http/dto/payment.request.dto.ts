import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';

export class CreatePaymentRequestDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  sourceAccountId!: string;

  @ApiProperty({ example: 1250, description: 'Amount in minor units (e.g. cents)' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amountMinor!: number;

  @ApiProperty({ example: 'USD', enum: ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY'] })
  @IsString()
  @IsNotEmpty()
  currency!: string;

  @ApiProperty({ example: 'Acme Utilities' })
  @IsString()
  @MinLength(1)
  creditorName!: string;

  @ApiProperty({ example: 'GB29NWBK60161331926819' })
  @IsString()
  @MinLength(1)
  creditorAccountRef!: string;

  @ApiProperty({ example: 'Invoice 1042' })
  @IsString()
  @MinLength(1)
  reference!: string;
}

export class AuthorizePaymentRequestDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  actorUserId!: string;
}

export class SubmitPaymentRequestDto {
  @ApiPropertyOptional({ description: 'Defaults to authenticated client' })
  @IsOptional()
  @IsString()
  actorClientId?: string;
}

export class CancelPaymentRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}
