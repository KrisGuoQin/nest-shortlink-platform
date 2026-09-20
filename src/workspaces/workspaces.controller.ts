import { Controller, Post, Req, Body, Get, Param, ParseUUIDPipe, Patch, Delete, HttpCode, HttpStatus } from '@nestjs/common';
import { WorkspacesService } from './workspaces.service.js';
import type { AuthenticatedRequest } from '../auth/interface/authenticated-request.interface.js';
import { CreateWorkspaceDto } from './dto/create-workspace.dto.js';
import { WorkspacePermissions } from '../authorization/decorators/workspace-permissions.decorator.js';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto.js';
import { AddWorkspaceMemberDto } from './dto/add-workspace-member.dto.js';
import { AssignWorkspaceRoleDto } from './dto/assign-workspace-role.dto.js';

@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly service: WorkspacesService) {}

  @Post()
  async create(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateWorkspaceDto
  ) {
    return await this.service.create(req.user.sub, dto)
  }

  @Get()
  async findMime(@Req() req: AuthenticatedRequest,) {
    return this.service.findMime(req.user.sub)
  }

  @Get(':workspaceId')
  @WorkspacePermissions('workspace:read')
  async findOne(@Param('workspaceId', ParseUUIDPipe) id: string) {
    return this.service.findOne(id)
  }

  @Patch(':workspaceId')
  @WorkspacePermissions('workspace:update')
  async patch(
    @Param('workspaceId', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWorkspaceDto
  ) {
    return await this.service.update(id, dto)
  }

  @Delete(':workspaceId')
  @WorkspacePermissions('workspace:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('workspaceId', ParseUUIDPipe) id: string,) {
    return await this.service.remove(id)
  }

  @Get(':workspaceId/members')
  @WorkspacePermissions('member:read')
  async findMembers(@Param('workspaceId', ParseUUIDPipe) id: string,) {
    return await this.service.findMembers(id)
  }

  @Post(':workspaceId/members')
  @WorkspacePermissions('member:invite')
  async addMember(
    @Param('workspaceId', ParseUUIDPipe) id: string,
    @Body() dto: AddWorkspaceMemberDto
  ) {
    return await this.service.addMember(id, dto)
  }

  @Post(':workspaceId/members/:memberId/role')
  @WorkspacePermissions('member:role:assign')
  async assignRole(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body() dto: AssignWorkspaceRoleDto
  ) {
    return await this.service.assignRole(workspaceId, memberId, dto.roleCode)
  }

  @Delete(':workspaceId/members/:memberId')
  @WorkspacePermissions('member:remove')
  async removeMember(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
  ) {
    await this.service.removeMember(workspaceId, memberId)
  }
}
