import {
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class QueryAnalyticsDto {
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;

  @IsOptional()
  @IsIn(['hour', 'day'])
  granularity: 'hour' | 'day' = 'day';

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone = 'UTC';
}
