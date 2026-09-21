import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { RedirectCacheService } from "../cache/redirect-cache.service.js";
import { SetShortLinkAccessDto } from "./dto/set-short-link-access.dto.js";
import { assertCanManageShortLink } from "./short-link-authorization.js";
import { ShortLinkVisibility } from "../generated/prisma/enums.js";
import * as argon2 from 'argon2'
import { GrantShortLinkUserDto } from "./dto/grant-short-link-user.dto.js";

@Injectable()
export class ShortLinkSharingService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly redirectCache: RedirectCacheService
    ) { }

    /**
     * 修改访问策略
     * @param workspaceId 
     * @param linkId 
     * @param userId 
     * @param roles 
     * @param dto 
     * @returns 
     */
    async setAccess(
        workspaceId: string,
        linkId: string,
        userId: string,
        roles: string[],
        dto: SetShortLinkAccessDto
    ) {
        const link = await this.prisma.shortLink.findFirst({
            where: {
                id: linkId,
                workspaceId,
            },
            select: {
                id: true,
                code: true,
                createdById: true,
                visibility: true,
                passwordHash: true,
            }
        })
        if (!link) {
            throw new NotFoundException('Short link not found')
        }
        assertCanManageShortLink(userId, roles, link.createdById)

        let passwordHash: string | null | undefined

        if (dto.visibility === ShortLinkVisibility.PASSWORD) {
            if (dto.password) {
                passwordHash = await argon2.hash(dto.password)
            } else if (!link.passwordHash) {
                throw new BadRequestException('Password is required for PASSWORD visibility',)
            }
        } else {
            passwordHash = null
        }

        /**
         * 分享策略属于安全敏感数据
         * 修改前先失效一次cache
         */
        await this.redirectCache.invalidate(link.code)
        // 更新link
        await this.prisma.shortLink.updateMany({
            where: {
                id: linkId,
                workspaceId
            },
            data: {
                visibility: dto.visibility,
                ...(passwordHash !== undefined ? { passwordHash } : {}),
                accessVersion: {
                    increment: 1,
                }
            }
        })
        // 修改后再删除一次，防止修改过程中有请求重新填充旧cache
        await this.redirectCache.invalidate(link.code)

        return this.prisma.shortLink.findFirst({
            where: {
                id: linkId,
                workspaceId,
            },
            select: {
                id: true,
                code: true,
                visibility: true,
                accessVersion: true,
            }
        })
    }

    /**
     * 显示授权某个用户
     * @param workspaceId 
     * @param linkId 
     * @param currentUserId 
     * @param roles 
     * @param dto 
     */
    async grantUser(
        workspaceId: string,
        linkId: string,
        currentUserId: string,
        roles: string[],
        dto: GrantShortLinkUserDto,
    ) {
        const link = await this.prisma.shortLink.findFirst({
            where: {
                id: linkId,
                workspaceId,
            },
            select: {
                id: true,
                createdById: true,
            }
        })
        if (!link) {
            throw new NotFoundException('Short link not found')
        }

        assertCanManageShortLink(currentUserId, roles, link.createdById)

        const targetUser = await this.prisma.user.findUnique({
            where: {
                email: dto.email
            },
            select: {
                id: true,
                email: true,
                name: true,
            }
        })
        if (!targetUser) {
            throw new NotFoundException(
                'User not found',
            );
        }

        await this.prisma.shortLinkShareUser.upsert({
            where: {
                shortLinkId_userId: {
                    shortLinkId: link.id,
                    userId: targetUser.id
                },
            },
            create: {
                shortLinkId: link.id,
                userId: targetUser.id
            },
            update: {}
        })

        return targetUser
    }

    /**
     * 
     * @param workspaceId 删除授权
     * @param linkId 
     * @param targetUserId 
     * @param currentUserId 
     * @param roles 
     */
    async revokeUser(
        workspaceId: string,
        linkId: string,
        targetUserId: string,
        currentUserId: string,
        roles: string[],
    ) {
        const link = await this.prisma.shortLink.findFirst({
            where: {
                id: linkId,
                workspaceId,
            },
            select: {
                id: true,
                createdById: true,
            }
        })
        if (!link) {
            throw new NotFoundException('Short link not found')
        }

        assertCanManageShortLink(currentUserId, roles, link.createdById)

        await this.prisma.shortLinkShareUser.deleteMany({
            where: {
                shortLinkId: link.id,
                userId: targetUserId
            }
        })
    }

    /**
     * 查询授权用户
     * @param workspaceId 
     * @param linkId 
     * @param currentUserId 
     * @param roles 
     * @returns 
     */
    async listSharedUsers(
        workspaceId: string,
        linkId: string,
        currentUserId: string,
        roles: string[],
    ) {
        const link = await this.prisma.shortLink.findFirst({
            where: {
                id: linkId,
                workspaceId,
            },
            select: {
                id: true,
                createdById: true,
            }
        })
        if (!link) {
            throw new NotFoundException('Short link not found')
        }
        assertCanManageShortLink(currentUserId, roles, link.createdById)

        return this.prisma.shortLinkShareUser.findMany({
            where: {
                shortLinkId: link.id
            },
            select: {
                createdAt: true,
                user: {
                    select: {
                        id: true,
                        email: true,
                        name: true,
                    }
                }
            }
        })
    }
}