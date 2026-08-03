import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class OAuthAuthorizeQueryDto {
  @ApiProperty({ example: 'client-id' })
  @IsString()
  @IsNotEmpty()
  client_id!: string;

  @ApiProperty({ example: 'https://app.example.com/callback' })
  @IsString()
  @IsNotEmpty()
  redirect_uri!: string;

  @ApiProperty({ example: 'code' })
  @IsIn(['code'])
  response_type!: 'code';

  @ApiProperty({ example: 'accounts:read openid offline_access' })
  @IsString()
  @IsNotEmpty()
  scope!: string;

  @ApiProperty({ example: 'random-state-value' })
  @IsString()
  @IsNotEmpty()
  state!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  code_challenge?: string;

  @ApiPropertyOptional({ enum: ['S256'] })
  @IsOptional()
  @IsIn(['S256'])
  code_challenge_method?: 'S256';

  @ApiPropertyOptional({
    description: 'OIDC nonce bound into the ID token when openid is requested',
  })
  @IsOptional()
  @IsString()
  nonce?: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  user_id!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  institution_id!: string;

  @ApiProperty({ example: 'Account aggregation' })
  @IsString()
  @MinLength(3)
  purpose!: string;
}

export class OAuthTokenRequestDto {
  @ApiProperty({ enum: ['authorization_code', 'refresh_token'] })
  @IsIn(['authorization_code', 'refresh_token'])
  grant_type!: 'authorization_code' | 'refresh_token';

  @ApiProperty({ example: 'client-id' })
  @IsString()
  @IsNotEmpty()
  client_id!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  client_secret?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  redirect_uri?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  code_verifier?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  refresh_token?: string;
}

export class OAuthRevokeRequestDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  token!: string;

  @ApiPropertyOptional({ enum: ['access_token', 'refresh_token'] })
  @IsOptional()
  @IsIn(['access_token', 'refresh_token'])
  token_type_hint?: 'access_token' | 'refresh_token';

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  client_id!: string;
}

export class OAuthIntrospectRequestDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  token!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  client_id!: string;
}
