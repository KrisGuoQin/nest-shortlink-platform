import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { AuditService } from './audit.service.js';
import { WorkspacePermissions } from '../authorization/decorators/workspace-permissions.decorator.js';
import { QueryAuditDto } from './dto/query-audit.dto.js';

@Controller('workspaces/:workspaceId/audit-logs')
export class AuditController {
  constructor(private readonly auditService: AuditService) { }

  @Get()
  @WorkspacePermissions('audit:read')
  async findAll(
    @Param('workspaceId', ParseUUIDPipe)
    workspaceId: string,
    @Query()
    query: QueryAuditDto
  ) {
    return await this.auditService.findAll(workspaceId, query)
  }
}
