import { Transform } from "class-transformer";
import { IsEmail, IsNotEmpty, IsOptional, IsString, Max, MaxLength, MinLength } from "class-validator";

export class RegisterDto {
    @Transform(({ value }) => {
        return typeof value === 'string'
            ? value.trim().toLowerCase()
            : value
    })
    @IsEmail()
    @MaxLength(254)
    email!: string;

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    name?: string;

    @IsString()
    @MinLength(8)
    @MaxLength(128)
    password!: string;
}