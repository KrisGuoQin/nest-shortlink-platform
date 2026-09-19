import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Request } from 'express';
import { AccessTokenPayload, JwtPayload } from "../interface/jwt-payload.interface.js";
import { AuthTokenService } from "../auth-token.service.js";
import { PrismaService } from "../../prisma/prisma.service.js";

interface RequestWithUser extends Request {
    user?: JwtPayload
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
    constructor(
        private readonly tokenService: AuthTokenService,
        private readonly prisnaService: PrismaService,
    ) { }

    async canActivate(context: ExecutionContext) {
        const request = context.switchToHttp().getRequest<RequestWithUser>()
        const token = this.extractTokenFromHeader(request)

        if (!token) {
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