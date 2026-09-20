import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ConfigService } from '@nestjs/config';
import { CreateShortLinkDto } from './dto/create-short-link.dto.js';
import { generateShortCode } from './short-code.js';
import { Prisma } from '../generated/prisma/client.js';
import { QueryShortLinkDto } from './dto/query-short-link.dto.js';
import { UpdateShortLinkDto } from './dto/update-short-link.dto.js';

@Injectable()
export class ShortLinksService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly config: ConfigService,
    ) { }

    async create(
        workspaceId: string,
        userId: string,
        dto: CreateShortLinkDto,
    ) {
        const expiresAt =
            dto.expiresAt
                ? new Date(
                    dto.expiresAt,
                )
                : null;

        if (
            expiresAt &&
            expiresAt <= new Date()
        ) {
            throw new BadRequestException(
                'expiresAt must be in the future',
            );
        }

        const MAX_ATTEMPTS = 5;
        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            const code = generateShortCode()
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
                        maxVisits: dto.maxVisits
                    }
                })
                return this.toResponse(link)
            } catch (error) {
                if (
                    error instanceof
                    Prisma.PrismaClientKnownRequestError &&
                    error.code === 'P2002'
                ) {
                    continue;
                }

                throw error;
            }
        }

        throw new ServiceUnavailableException(
            'Unable to allocate a short code',
        );
    }

    async findAll(
        workspaceId: string,
        dto: QueryShortLinkDto
    ) {
        const { page, pageSize, status } = dto
        const skip = (page - 1) * pageSize
        const where: Prisma.ShortLinkWhereInput = {
            workspaceId,
            ...(status ? { status } : {})
        }
        const [links, total] = await Promise.all([
            this.prisma.shortLink.findMany({
                where,
                skip,
                take: pageSize,
                orderBy: {
                    createdAt: 'desc'
                },
                include: {
                    createdBy: {
                        select: {
                            id: true,
                            email: true,
                            name: true,
                        }
                    }
                }
            }),
            this.prisma.shortLink.count({
                where,
            })
        ])

        return {
            data: links.map(link => this.toResponse(link)),
            pagination: {
                page,
                pageSize,
                total,
                totalPages: Math.ceil(total / pageSize)
            }
        }
    }

    async findOne(
        workspaceId: string,
        linkId: string,
    ) {
        const link = await this.prisma.shortLink.findFirst({
            where: {
                workspaceId,
                id: linkId
            },
            include: {
                createdBy: {
                    select: {
                        id: true,
                        email: true,
                        name: true,
                    }
                }
            }
        })


        if (!link) {
            throw new NotFoundException(
                'Short link not found',
            );
        }

        return this.toResponse(
            link,
        );
    }

    async update(
        workspaceId: string,
        userId: string,
        linkId: string,
        roles: string[],
        dto: UpdateShortLinkDto
    ) {
        const link = await this.prisma.shortLink.findFirst({
            where: {
                id: linkId,
                workspaceId
            },
            select: {
                id: true,
                createdById: true
            }
        })
        if (!link) {
            throw new NotFoundException(
                'Short link not found',
            );
        }
        this.assertCanManage(userId, roles, link.createdById)
        const expiresAt =
            dto.expiresAt
                ? new Date(
                    dto.expiresAt,
                )
                : undefined;

        if (
            expiresAt &&
            expiresAt <= new Date()
        ) {
            throw new BadRequestException(
                'expiresAt must be in the future',
            );
        }
        await this.prisma.shortLink.updateMany({
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
                expiresAt
            }
        })

        return await this.findOne(workspaceId, linkId)
    }

    async remove(
        workspaceId: string,
        linkId: string,
        userId: string,
        roles: string[],
    ) {
        const link =
            await this.prisma
                .shortLink
                .findFirst({
                    where: {
                        id: linkId,

                        workspaceId,
                    },

                    select: {
                        id: true,

                        createdById:
                            true,
                    },
                });

        if (!link) {
            throw new NotFoundException(
                'Short link not found',
            );
        }

        this.assertCanManage(
            userId,
            roles,
            link.createdById,
        );

        const result =
            await this.prisma
                .shortLink
                .deleteMany({
                    where: {
                        id: linkId,

                        workspaceId,
                    },
                });

        if (
            result.count !== 1
        ) {
            throw new NotFoundException(
                'Short link not found',
            );
        }
    }

    private toResponse<T extends { code: string }>(link: T) {
        const baseUrl = this.config.getOrThrow<string>('SHORT_BASE_URL').replace(/\/+$/, '')
        return {
            ...link,
            shortUrl: `${baseUrl}/${link.code}`
        }
    }

    private assertCanManage(
        userId: string,
        roles: string[],
        createdById: string,
    ) {
        const privileged = roles.includes('OWNER') || roles.includes('ADMIN')
        if (privileged) {
            return
        }
        if (createdById === userId) {
            return
        }
        throw new ForbiddenException(
            'You can only manage links you created',
        );
    }
}
