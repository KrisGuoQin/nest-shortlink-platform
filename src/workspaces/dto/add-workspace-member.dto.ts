import {
  Transform,
} from 'class-transformer';

import {
  IsEmail,
} from 'class-validator';

export class AddWorkspaceMemberDto {
  @Transform(({ value }) => {
    return typeof value === 'string'
      ? value.trim().toLowerCase()
      : value;
  })
  @IsEmail()
  email!: string;
}