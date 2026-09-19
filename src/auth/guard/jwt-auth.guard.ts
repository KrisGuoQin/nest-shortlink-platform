import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Request } from 'express';
import { JwtPayload } from "../interface/jwt-payload.interface.js";

interface RequestWithUser extends Request {
    user?: JwtPayload
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
    constructor(private readonly jwtService: JwtService) {}

    async canActivate(context: ExecutionContext) {
        const request = context.switchToHttp().getRequest<RequestWithUser>()
        const token = this.extractTokenFromHeader(request)

        if (!token) {
            throw new UnauthorizedException('Access token is required')
        }

        try {
            const payload = await this.jwtService.verifyAsync<JwtPayload>(token)
            request.user = payload
        } catch (error) {
            throw new UnauthorizedException('Invalid or expiresd access token')
        }

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