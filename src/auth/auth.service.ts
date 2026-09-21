import { HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt'
import * as argon2 from 'argon2';
import { UsersService } from '../users/users.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { JwtPayload, RefreshTokenPayload } from './interface/jwt-payload.interface.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthTokenService } from './auth-token.service.js';
import { randomUUID } from 'node:crypto';
import { RateLimitService } from '../rate-limit/rate-limit.service.js';

@Injectable()
export class AuthService {
    constructor(
        private readonly usersSServices: UsersService,
        private readonly prismaService: PrismaService,
        private readonly tokenService: AuthTokenService,
        private readonly rateLimitService: RateLimitService,
    ) { }

    async register(dto: RegisterDto) {
        const passwordHash = await argon2.hash(dto.password)

        return this.usersSServices.createForAuth({
            email: dto.email,
            name: dto.name,
            passwordHash,
        })
    }

    async login(dto: LoginDto) {
        const user = await this.usersSServices.findByEmailForAuth(dto.email)

        if (!user) {
            // 登录用户不存在也应用限流行为，防止攻击者利用行为差异枚举账户
            await this.rateLimitService.accountFailure(dto.email)
            throw new UnauthorizedException('Invalid email or password')
        }

        const passwordMatched = await argon2.verify(user.passwordHash, dto.password)

        if (!passwordMatched) {
            const result = await this.rateLimitService.accountFailure(dto.email)
            // 登录失败次数超过限制
            if (!result.allowed) {
                throw new HttpException(
                    'Too many failed login attempts',
                    HttpStatus.TOO_MANY_REQUESTS
                )
            }

            throw new UnauthorizedException('Invalid email or password')
        }

        const sessionId = randomUUID()
        const version = 0
        const refreshToken = await this.tokenService.signRefreshToken(user.id, sessionId, version)
        const accessToken = await this.tokenService.signAccessToken(user.id, sessionId)
        const refreshTokenHash = this.tokenService.hashRefreshToken(refreshToken)

        // 登录成功，清除登录失败次数限制
        await this.rateLimitService.clearAccountFailure(dto.email)

        await this.prismaService.authSession.create({
            data: {
                id: sessionId,
                userId: user.id,
                refreshTokenHash,
                version,
                expiresAt: this.tokenService.getRefreshExpiresAt()
            }
        })

        return {
            accessToken,
            refreshToken,
            tokenType: 'Bearer',
            accessTokenExpiresIn: this.tokenService.getAccessTokenExpiresIn(),
            refreshTokenExpiresIn: this.tokenService.getRefreshTokenExpiresIn()
        }
    }

    async logout(userId: string, sessionId: string) {
        await this.prismaService.authSession.updateMany({
            where: {
                id: sessionId,
                userId,
                revokedAt: null
            },
            data: {
                revokedAt: new Date()
            }
        })
    }

    async logoutAll(userId: string) {
        await this.prismaService.authSession.updateMany({
            where: {
                userId,
                revokedAt: null
            },
            data: {
                revokedAt: new Date()
            }
        })
    }

    async refresh(refreshToken: string) {
        let payload: RefreshTokenPayload;
        try {
            payload = await this.tokenService.verifyRefreshToken(refreshToken)
        } catch (error) {
            throw new UnauthorizedException('Invalid or expired refresh token')
        }
        const currentHash = this.tokenService.hashRefreshToken(refreshToken)

        // 计算下一次的
        const nextVersion = payload.ver + 1
        const nextRefreshToken = await this.tokenService.signRefreshToken(
            payload.sub,
            payload.sid,
            nextVersion
        )
        const nextAccessToken = await this.tokenService.signAccessToken(
            payload.sub,
            payload.sid
        )
        const nextHash = this.tokenService.hashRefreshToken(nextRefreshToken)
        console.log('payload', payload)
        // 根据数据库中匹配到的老数据进行更新
        // 使用updateMany，而不是update,是为了并发竞态问题，属于乐观并发控制
        const result = await this.prismaService.authSession.updateMany({
            where: {
                id: payload.sid,
                userId: payload.sub,
                version: payload.ver,
                refreshTokenHash: currentHash,
                revokedAt: null,
                expiresAt: {
                    gt: new Date()
                }
            },
            data: {
                version: nextVersion,
                refreshTokenHash: nextHash,
                expiresAt: this.tokenService.getRefreshExpiresAt()
            }
        })

        if (result.count !== 1) {
            throw new UnauthorizedException(
                'Refresh token is invalid, revoked, expired, or already used',
            );
        }

        return {
            accessToken: nextAccessToken,
            refreshToken: nextRefreshToken,
            tokenType: 'Bearer',
            accessTokenExpiresIn: this.tokenService.getAccessTokenExpiresIn(),
            refreshTokenExpiresIn: this.tokenService.getRefreshTokenExpiresIn()
        }
    }

    async me(userId: string) {
        return await this.usersSServices.findOne(userId)
    }
}
