import {
  Transform,
} from 'class-transformer';

import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @Transform(({ value }) => {
    return typeof value === 'string'
      ? value.trim().toLowerCase()
      : value;
  })
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;
}