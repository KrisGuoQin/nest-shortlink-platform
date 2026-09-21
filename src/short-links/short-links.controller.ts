import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';

import { WorkspacePermissions } from '../authorization/decorators/workspace-permissions.decorator.js';

import type { WorkspaceAuthenticatedRequest } from '../authorization/interfaces/workspace-authenticated-request.interface.js';

import { CreateShortLinkDto } from './dto/create-short-link.dto.js';

import { QueryShortLinkDto } from './dto/query-short-link.dto.js';

import { UpdateShortLinkDto } from './dto/update-short-link.dto.js';

import { ShortLinksService } from './short-links.service.js';
import { RateLimit } from '../rate-limit/decorators/rate-limit.decorators.js';

@Controller('workspaces/:workspaceId/links')
export class ShortLinksController {
  constructor(private readonly shortLinksService: ShortLinksService) { }

  @Post()
  @WorkspacePermissions('link:create')
  @RateLimit({ // 整个workspace下的所有成员，一分钟内最多创建30条
    algorithm: 'fixed',
    prefix: 'create-link',
    keyType: 'workspace',
    limit: 30,
    windowSeconds: 60
  })
  create(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Req() request: WorkspaceAuthenticatedRequest,
    @Body() dto: CreateShortLinkDto,
  ) {
    return this.shortLinksService.create(
      workspaceId,
      request.user.sub,
      dto,
    );
  }

  @Get()
  @WorkspacePermissions('link:read')
  findAll(
    @Param('workspaceId', ParseUUIDPipe)
    workspaceId: string,

    @Query()
    query: QueryShortLinkDto,
  ) {
    return this.shortLinksService.findAll(workspaceId, query);
  }

  @Get(':linkId')
  @WorkspacePermissions('link:read')
  findOne(
    @Param('workspaceId', ParseUUIDPipe)
    workspaceId: string,

    @Param('linkId', ParseUUIDPipe)
    linkId: string,
  ) {
    return this.shortLinksService.findOne(workspaceId, linkId);
  }

  @Patch(':linkId')
  @WorkspacePermissions('link:update')
  update(
    @Param('workspaceId', ParseUUIDPipe)
    workspaceId: string,

    @Param('linkId', ParseUUIDPipe)
    linkId: string,

    @Req()
    request: WorkspaceAuthenticatedRequest,

    @Body()
    dto: UpdateShortLinkDto,
  ) {
    return this.shortLinksService.update(
      workspaceId,

      linkId,

      request.user.sub,

      request.workspaceAccess.roles,

      dto,
    );
  }

  @Delete(':linkId')
  @WorkspacePermissions('link:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('workspaceId', ParseUUIDPipe)
    workspaceId: string,
    @Param('linkId', ParseUUIDPipe)
    linkId: string,
    @Req()
    request: WorkspaceAuthenticatedRequest,
  ) {
    await this.shortLinksService.remove(
      workspaceId,

      linkId,

      request.user.sub,

      request.workspaceAccess.roles,
    );
  }
}
