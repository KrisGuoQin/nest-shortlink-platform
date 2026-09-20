import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthorizationService } from "../authorization.service.js";
import { Observable } from "rxjs";
import { PERMISSIONS_KEY } from "../decorators/permissions.decorator.js";
import { AuthenticatedRequest } from "../../auth/interface/authenticated-request.interface.js";

@Injectable()
export class PermissionGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly authService: AuthorizationService,
    ) {}

    async canActivate(context: ExecutionContext) {
        const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
            PERMISSIONS_KEY,
            [
                context.getHandler(),
                context.getClass()
            ]
        )

        if (!requiredPermissions?.length) {
            return true
        }

        const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
        const user = request.user

        if (!user) {
            throw new UnauthorizedException()
        }
        const allowed = await this.authService.hasAllPermissions(user.sub, requiredPermissions)

        if(!allowed) {
            throw new ForbiddenException('Insufficient permission')
        }

        return true
    }

}