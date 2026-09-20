import {
  Type,
} from 'class-transformer';

import {
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
} from 'class-validator';

import {
  ShortLinkVisibility,
} from '../../generated/prisma/client.js';

export class CreateShortLinkDto {
  @IsUrl({
    protocols: [
      'http',
      'https',
    ],

    require_protocol: true,
  })
  originalUrl!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsEnum(
    ShortLinkVisibility,
  )
  visibility:
    ShortLinkVisibility =
      ShortLinkVisibility.PUBLIC;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxVisits?: number;
}