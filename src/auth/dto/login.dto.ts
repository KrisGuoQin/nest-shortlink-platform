import { Transform } from 'class-transformer';

import {
  IsEmail,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class LoginDto {
  @Transform(({ value }) => {
    return typeof value === 'string'
      ? value.trim().toLowerCase()
      : value;
  })
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}