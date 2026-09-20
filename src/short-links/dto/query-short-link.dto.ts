import {
    Type,
} from 'class-transformer';

import {
    IsEnum,
    IsInt,
    IsOptional,
    Max,
    Min,
} from 'class-validator';

import {
    ShortLinkStatus,
} from '../../generated/prisma/client.js';

export class QueryShortLinkDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page = 1;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    pageSize = 20;

    @IsOptional()
    @IsEnum(
        ShortLinkStatus,
    )
    status?: ShortLinkStatus;
}