import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { QueryAuditDto } from './dto/query-audit.dto.js';

@Injectable()
export class AuditService {
    constructor(private readonly prisma: PrismaService) { }

    async findAll(workspaceId: string, dto: QueryAuditDto) {
        const { page, pageSize } = dto;
        const skip = (page - 1) * pageSize;
        const [data, total] = await Promise.all([
            this.prisma.auditLog.findMany({
                where: {
                    workspaceId,
                },
                skip,
                take: pageSize,
                orderBy: {
                    createdAt: 'desc',
                },
            }),
            this.prisma.auditLog.count({
                where: { workspaceId },
            }),
        ]);

        return {
            data,
            pagination: {
                page,
                pageSize,
                total,
                totalPages: Math.ceil(total / pageSize),
            },
        };
    }
}
