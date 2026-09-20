import {
  IsNotEmpty,
  IsString,
} from 'class-validator';

export class AssignWorkspaceRoleDto {
  @IsString()
  @IsNotEmpty()
  roleCode!: string;
}