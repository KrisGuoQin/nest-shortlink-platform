import {
    IsEnum,
    IsOptional,
    IsString,
    MaxLength,
    MinLength,
} from 'class-validator';

import {
    ShortLinkVisibility,
} from '../../generated/prisma/client.js';

export class SetShortLinkAccessDto {
    @IsEnum(
        ShortLinkVisibility,
    )
    visibility!:
        ShortLinkVisibility;

    @IsOptional()
    @IsString()
    @MinLength(6)
    @MaxLength(128)
    password?: string;
}