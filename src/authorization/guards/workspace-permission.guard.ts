import {
    BadRequestException,
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { Reflector } from '@nestjs/core';

import { isUUID } from 'class-validator';

import { AuthorizationService } from '../authorization.service.js';

import { WORKSPACE_PERMISSIONS_KEY } from '../decorators/workspace-permissions.decorator.js';
import { WorkspaceAuthenticatedRequest } from '../interfaces/workspace-authenticated-request.interface.js';

@Injectable()
export class WorkspacePermissionGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly authorizationService: AuthorizationService,
    ) { }

    async canActivate(context: ExecutionContext) {
        // 1. 获取装饰器设置的值
        const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
            WORKSPACE_PERMISSIONS_KEY,
            [context.getHandler(), context.getClass()],
        );
        // 2.没设置或者空值，放行
        if (!requiredPermissions || requiredPermissions.length === 0) {
            return true;
        }

        const request = context.switchToHttp().getRequest<WorkspaceAuthenticatedRequest>();

        const workspaceId = request.params?.workspaceId as string;

        if (!workspaceId || !isUUID(workspaceId)) {
            throw new BadRequestException('Invalid workspaceId');
        }

        // 3.使用uid和wid获取权限
        const access = await this.authorizationService.getWorkspaceAccess(
            request.user.sub,
            workspaceId,
        );

        if (!access) {
            throw new NotFoundException('Workspace not found');
        }

        // 4.校验权限
        const allowed = requiredPermissions.every((permission) =>
            access.permissionCodes.has(permission),
        );

        if (!allowed) {
            throw new ForbiddenException('Insufficient workspace permission');
        }

        request.workspaceAccess = {
            workspaceId,

            memberId: access.memberId,

            roles: access.roles,

            permissionCodes: access.permissionCodes,
        };

        return true;
    }
}
