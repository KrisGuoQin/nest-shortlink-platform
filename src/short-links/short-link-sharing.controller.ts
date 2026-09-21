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
    Req,
} from '@nestjs/common';

import { WorkspacePermissions } from '../authorization/decorators/workspace-permissions.decorator.js';

import type { WorkspaceAuthenticatedRequest } from '../authorization/interfaces/workspace-authenticated-request.interface.js';

import { GrantShortLinkUserDto } from './dto/grant-short-link-user.dto.js';

import { SetShortLinkAccessDto } from './dto/set-short-link-access.dto.js';

import { ShortLinkSharingService } from './short-link-sharing.service.js';

@Controller('workspaces/:workspaceId/links')
export class ShortLinkSharingController {
    constructor(private readonly sharingService: ShortLinkSharingService) { }

    @Patch(':linkId/access')
    @WorkspacePermissions('link:update')
    setAccess(
        @Param('workspaceId', ParseUUIDPipe)
        workspaceId: string,

        @Param('linkId', ParseUUIDPipe)
        linkId: string,

        @Req()
        request: WorkspaceAuthenticatedRequest,

        @Body()
        dto: SetShortLinkAccessDto,
    ) {
        return this.sharingService.setAccess(
            workspaceId,
            linkId,
            request.user.sub,
            request.workspaceAccess.roles,
            dto,
        );
    }

    @Get(':linkId/share-users')
    @WorkspacePermissions('link:update')
    listUsers(
        @Param('workspaceId', ParseUUIDPipe)
        workspaceId: string,

        @Param('linkId', ParseUUIDPipe)
        linkId: string,

        @Req()
        request: WorkspaceAuthenticatedRequest,
    ) {
        return this.sharingService.listSharedUsers(
            workspaceId,
            linkId,
            request.user.sub,
            request.workspaceAccess.roles,
        );
    }

    @Post(':linkId/share-users')
    @WorkspacePermissions('link:update')
    grantUser(
        @Param('workspaceId', ParseUUIDPipe)
        workspaceId: string,

        @Param('linkId', ParseUUIDPipe)
        linkId: string,

        @Req()
        request: WorkspaceAuthenticatedRequest,

        @Body()
        dto: GrantShortLinkUserDto,
    ) {
        return this.sharingService.grantUser(
            workspaceId,
            linkId,
            request.user.sub,
            request.workspaceAccess.roles,
            dto,
        );
    }

    @Delete(':linkId/share-users/:userId')
    @WorkspacePermissions('link:update')
    @HttpCode(HttpStatus.NO_CONTENT)
    async revokeUser(
        @Param('workspaceId', ParseUUIDPipe)
        workspaceId: string,

        @Param('linkId', ParseUUIDPipe)
        linkId: string,

        @Param('userId', ParseUUIDPipe)
        userId: string,

        @Req()
        request: WorkspaceAuthenticatedRequest,
    ) {
        await this.sharingService.revokeUser(
            workspaceId,
            linkId,
            userId,
            request.user.sub,
            request.workspaceAccess.roles,
        );
    }
}
