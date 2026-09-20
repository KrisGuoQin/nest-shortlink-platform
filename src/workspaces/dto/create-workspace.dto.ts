import {
  Transform,
} from 'class-transformer';

import {
  IsNotEmpty,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateWorkspaceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @Transform(({ value }) => {
    return typeof value === 'string'
      ? value.trim().toLowerCase()
      : value;
  })
  @IsString()
  @Length(3, 50)
  @Matches(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  )
  slug!: string;
}