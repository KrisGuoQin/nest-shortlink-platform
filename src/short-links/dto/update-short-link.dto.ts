import { PartialType } from '@nestjs/mapped-types';

import { CreateShortLinkDto } from './create-short-link.dto.js';

export class UpdateShortLinkDto extends PartialType(CreateShortLinkDto) {}
