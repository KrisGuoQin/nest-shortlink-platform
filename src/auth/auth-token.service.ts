import { Injectable } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { JwtService } from "@nestjs/jwt"
import { AccessTokenPayload, RefreshTokenPayload } from "./interface/jwt-payload.interface.js"
import { createHash } from "node:crypto"

const ACCESS_TOKEN_TTL = 15 * 60
const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60

@Injectable()
export class AuthTokenService {
    constructor(
        private readonly jwtService: JwtService,
        private readonly configService: ConfigService
    ) { }

    async signAccessToken(
        userId: string,
        sessionId: string,
    ) {
        const payload: AccessTokenPayload = {
            sub: userId,
            sid: sessionId,
            type: 'access'
        }

        return this.jwtService.signAsync(
            payload,
            {
                secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
                expiresIn: ACCESS_TOKEN_TTL
            },
        )
    }

    async signRefreshToken(
        userId: string,
        sessionId: string,
        version: number,
    ) {
        const payload: RefreshTokenPayload = {
            sub: userId,
            sid: sessionId,
            ver: version,
            type: 'refresh'
        }

        return this.jwtService.signAsync(
            payload,
            {
                secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
                expiresIn: REFRESH_TOKEN_TTL
            },
        )
    }

    async verifyAccessToken(token: string) {
        const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(
            token,
            {
                secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
            }
        )

        if (payload.type !== 'access') {
            throw new Error('Invalid token type')
        }

        return payload
    }

    async verifyRefreshToken(
        token: string,
    ) {
        const payload =
            await this.jwtService
                .verifyAsync<RefreshTokenPayload>(
                    token,
                    {
                        secret:
                            this.configService
                                .getOrThrow<string>(
                                    'JWT_REFRESH_SECRET',
                                ),
                    },
                );

        if (
            payload.type !== 'refresh'
        ) {
            throw new Error(
                'Invalid token type',
            );
        }

        return payload;
    }

    hashRefreshToken(refreshToken: string) {
        return createHash('sha256').update(refreshToken).digest('hex')
    }

    getRefreshExpiresAt() {
        return new Date(Date.now() + REFRESH_TOKEN_TTL * 1000)
    }

    getAccessTokenExpiresIn() {
        return ACCESS_TOKEN_TTL
    }

    getRefreshTokenExpiresIn() {
        return REFRESH_TOKEN_TTL;
    }
}