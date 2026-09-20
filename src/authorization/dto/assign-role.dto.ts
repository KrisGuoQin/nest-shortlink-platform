import { IsNotEmpty, IsString, IsUUID } from "class-validator";

export class AssignRoleDto {
    @IsUUID()
    userId!: string;

    @IsString()
    @IsNotEmpty()
    roleCode!: string;
}