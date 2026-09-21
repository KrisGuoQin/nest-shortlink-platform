import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
    ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ConfigService } from '@nestjs/config';
import { CreateShortLinkDto } from './dto/create-short-link.dto.js';
import { generateShortCode } from './short-code.js';
import { Prisma } from '../generated/prisma/client.js';
import { QueryShortLinkDto } from './dto/query-short-link.dto.js';
import { UpdateShortLinkDto } from './dto/update-short-link.dto.js';
import { RedirectCacheService } from '../cache/redirect-cache.service.js';
import { assertCanManageShortLink } from './short-link-authorization.js';
import { AuditOutboxService } from '../audit/audit-outbox.service.js';

@Injectable()
export class ShortLinksService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly config: ConfigService,
        private readonly cache: RedirectCacheService,
        private readonly auditOutboxService: AuditOutboxService,
    ) { }

    async create(workspaceId: string, userId: string, dto: CreateShortLinkDto) {
        const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;

        if (expiresAt && expiresAt <= new Date()) {
            throw new BadRequestException('expiresAt must be in the future');
        }

        const MAX_ATTEMPTS = 5;
        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            const code = generateShortCode();
            try {
                const link = await this.prisma.shortLink.create({
                    data: {
                        workspaceId,
                        createdById: userId,
                        code,
                        expiresAt,
                        originalUrl: dto.originalUrl,
                        title: dto.title,
                        visibility: dto.visibility,
                        maxVisits: dto.maxVisits,
                    },
                });

                // 一个新的code也需要进行失效操作
                // 因为攻击者可能先请求不存在的，系统设置Negative cache
                // 随后恰好系统创建同一个Code，如果不清理，TTL内就请求不到新link
                await this.cache.invalidate(link.code);

                return this.toResponse(link);
            } catch (error) {
                if (
                    error instanceof Prisma.PrismaClientKnownRequestError &&
                    error.code === 'P2002'
                ) {
                    continue;
                }

                throw error;
            }
        }

        throw new ServiceUnavailableException('Unable to allocate a short code');
    }

    async findAll(workspaceId: string, dto: QueryShortLinkDto) {
        const { page, pageSize, status } = dto;
        const skip = (page - 1) * pageSize;
        const where: Prisma.ShortLinkWhereInput = {
            workspaceId,
            ...(status ? { status } : {}),
        };
        const [links, total] = await Promise.all([
            this.prisma.shortLink.findMany({
                where,
                skip,
                take: pageSize,
                orderBy: {
                    createdAt: 'desc',
                },
                include: {
                    createdBy: {
                        select: {
                            id: true,
                            email: true,
                            name: true,
                        },
                    },
                },
            }),
            this.prisma.shortLink.count({
                where,
            }),
        ]);

        return {
            data: links.map((link) => this.toResponse(link)),
            pagination: {
                page,
                pageSize,
                total,
                totalPages: Math.ceil(total / pageSize),
            },
        };
    }

    async findOne(workspaceId: string, linkId: string) {
        const link = await this.prisma.shortLink.findFirst({
            where: {
                workspaceId,
                id: linkId,
            },
            include: {
                createdBy: {
                    select: {
                        id: true,
                        email: true,
                        name: true,
                    },
                },
            },
        });

        if (!link) {
            throw new NotFoundException('Short link not found');
        }

        return this.toResponse(link);
    }

    async update(
        workspaceId: string,
        userId: string,
        linkId: string,
        roles: string[],
        dto: UpdateShortLinkDto,
        requestId?: string,
    ) {
        const updated = await this.prisma.$transaction(async (tx) => {
            const link = await tx.shortLink.findFirst({
                where: {
                    id: linkId,
                    workspaceId,
                },
                select: {
                    id: true,
                    code: true,
                    createdById: true,
                },
            });
            if (!link) {
                throw new NotFoundException('Short link not found');
            }
            assertCanManageShortLink(userId, roles, link.createdById);

            const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : undefined;
            if (expiresAt && expiresAt <= new Date()) {
                throw new BadRequestException('expiresAt must be in the future');
            }
            const updatedLink = await tx.shortLink.update({
                where: {
                    id: linkId,
                    workspaceId,
                },
                data: {
                    originalUrl: dto.originalUrl,
                    title: dto.title,
                    visibility: dto.visibility,
                    maxVisits: dto.maxVisits,
                    status: dto.status,
                    expiresAt,
                },
                include: {
                    createdBy: {
                        select: {
                            id: true,
                            email: true,
                            name: true
                        }
                    }
                }
            });

            await this.auditOutboxService.record(tx, {
                eventType: 'short-link.updated.v1',
                workspaceId,
                actorUserId: userId,
                requestId,
                action: 'shortlink.update',
                resourceType: 'ShortLink',
                resourceId: link.id,
                data: {
                    code: link.code,
                    changedFields: Object.keys(dto),
                },
            });

            return updatedLink
        });

        // 事务成功后清除缓存
        await this.cache.invalidate(updated.code);

        return this.toResponse(updated)
    }

    async remove(
        workspaceId: string,
        linkId: string,
        userId: string,
        roles: string[],
        requestId?: string,
    ) {
        await this.prisma.$transaction(async (tx) => {
            const link = await tx.shortLink.findFirst({
                where: {
                    id: linkId,

                    workspaceId,
                },

                select: {
                    id: true,
                    code: true,
                    createdById: true,
                },
            });
            if (!link) {
                throw new NotFoundException('Short link not found');
            }
            assertCanManageShortLink(userId, roles, link.createdById);
            const result = await tx.shortLink.deleteMany({
                where: {
                    id: linkId,
                    workspaceId,
                },
            });

            if (result.count !== 1) {
                throw new NotFoundException('Short link not found');
            }
            await this.cache.invalidate(link.code);
            await this.cache.deleteStats(link.id);

            // 审计日志
            await this.auditOutboxService.record(tx, {
                eventType: 'shortlink.deleted.v1',
                workspaceId,
                actorUserId: userId,
                requestId,
                action: 'shortlink.delete',
                resourceId: link.id,
                resourceType: 'ShortLink',
                data: {
                    code: link.code,
                },
            });
        });
    }

    private toResponse<T extends { code: string }>(link: T) {
        const baseUrl = this.config
            .getOrThrow<string>('SHORT_BASE_URL')
            .replace(/\/+$/, '');
        return {
            ...link,
            shortUrl: `${baseUrl}/${link.code}`,
        };
    }
}
