import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength} from 'class-validator'

export class CreateUserDto {
    @IsEmail()
    @IsNotEmpty()
    @MaxLength(254)
    email!: string;

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    name?: string
}