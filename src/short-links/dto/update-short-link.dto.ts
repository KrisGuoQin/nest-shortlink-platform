import { PartialType } from '@nestjs/mapped-types';

import { CreateShortLinkDto } from './create-short-link.dto.js';
import { IsEnum, IsOptional } from 'class-validator';
import { ShortLinkStatus } from '../../generated/prisma/enums.js';

export class UpdateShortLinkDto extends PartialType(CreateShortLinkDto) {
    @IsOptional()
    @IsEnum(ShortLinkStatus)
    status?: ShortLinkStatus;
}
