import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Req } from '@nestjs/common';
import { AuthorizationService } from './authorization.service.js';
import type{ AuthenticatedRequest } from '../auth/interface/authenticated-request.interface.js';
import { Permissions } from './decorators/permissions.decorator.js';
import { AssignRoleDto } from './dto/assign-role.dto.js';

@Controller('authorization')
export class AuthorizationController {
  constructor(private readonly service: AuthorizationService) {}

  @Get('me')
  async getMyAccess(@Req() request: AuthenticatedRequest) {
    return await this.service.getAccess(request.user.sub)
  }

  @Get('roles')
  @Permissions('role:read')
  async listRoles() {
    return this.service.listRoles()
  }

  @Post('roles/assgin')
  @Permissions('role:assign')
  async assignRole(@Body() dto:AssignRoleDto) {
    return this.service.assignRole(dto.userId, dto.roleCode)
  }

  @Delete('roles/:roleCode/users/:userId')
  @Permissions('role:assign')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeRole(
    @Param('roleCode') roleCode: string,
    @Param('userId') userId: string,
  ) {
    return this.service.revokeRole(userId, roleCode)
  }
}
