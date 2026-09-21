import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Request } from 'express';
import { AccessTokenPayload, JwtPayload } from "../interface/jwt-payload.interface.js";
import { AuthTokenService } from "../auth-token.service.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { Reflector } from "@nestjs/core";
import { IS_PUBLIC_KEY } from "../../common/decorators/public.decorator.js";
import { OPTIONAL_AUTH_KEY } from "../../common/decorators/optional-auth.decorator.js";

interface RequestWithUser extends Request {
    user?: JwtPayload
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
    constructor(
        private readonly tokenService: AuthTokenService,
        private readonly prisnaService: PrismaService,
        private readonly reflector: Reflector,
    ) { }

    async canActivate(context: ExecutionContext) {
        // @Public()装饰器
        const isPublic = this.reflector.getAllAndOverride<boolean>(
            IS_PUBLIC_KEY,
            [
                context.getHandler(),
                context.getClass()
            ]
        )
        if (isPublic) {
            return true
        }
        const optionalAuth = this.reflector.getAllAndOverride<boolean>(
            OPTIONAL_AUTH_KEY,
            [
                context.getHandler(),
                context.getClass(),
            ]
        )

        const request = context.switchToHttp().getRequest<RequestWithUser>()
        const token = this.extractTokenFromHeader(request)

        if (!token) {
            // 无token，匿名的继续
            if (optionalAuth) {
                return true
            }
            throw new UnauthorizedException('Access token is required')
        }

        let payload: AccessTokenPayload;

        try {
            payload = await this.tokenService.verifyAccessToken(token)
        } catch (error) {
            throw new UnauthorizedException('Invalid or expiresd access token')
        }

        const session = await this.prisnaService.authSession.findFirst({
            where: {
                id: payload.sid,
                userId: payload.sub,
                revokedAt: null,
                expiresAt: {
                    gt: new Date()
                }
            },
            select: {
                id: true
            }
        })

        if (!session) {
            throw new UnauthorizedException('Session is invalid or revoked')
        }

        request.user = payload

        return true
    }

    private extractTokenFromHeader(
        request: Request,
    ) {
        const authorization =
            request.headers.authorization;

        if (!authorization) {
            return undefined;
        }

        const [
            type,
            token,
        ] = authorization.split(' ');

        if (
            type !== 'Bearer' ||
            !token
        ) {
            return undefined;
        }

        return token;
    }
}