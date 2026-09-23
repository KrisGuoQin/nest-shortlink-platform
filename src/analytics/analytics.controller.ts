import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { WorkspacePermissions } from '../authorization/decorators/workspace-permissions.decorator.js';
import { AnalyticsService } from './analytics.service.js';
import { QueryAnalyticsDto } from './dto/query-analytics.dto.js';

@Controller('workspaces/:workspaceId')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('analytics')
  @WorkspacePermissions('analytics:read')
  getWorkspaceOverview(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Query() query: QueryAnalyticsDto,
  ) {
    return this.analytics.getWorkspaceOverview(workspaceId, query);
  }

  @Get('links/:linkId/analytics')
  @WorkspacePermissions('analytics:read')
  getShortLinkAnalytics(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('linkId', ParseUUIDPipe) linkId: string,
    @Query() query: QueryAnalyticsDto,
  ) {
    return this.analytics.getShortLinkAnalytics(workspaceId, linkId, query);
  }
}
