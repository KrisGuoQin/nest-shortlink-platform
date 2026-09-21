import {
    HttpException,
    HttpStatus,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import {
    ShortLinkStatus,
    ShortLinkVisibility,
} from '../generated/prisma/client.js';

import { PrismaService } from '../prisma/prisma.service.js';
import {
    RedirectCacheService,
    type RedirectSnapshot,
} from '../cache/redirect-cache.service.js';

interface RedirectRow {
    originalUrl: string;
    visitCount: number;
}

@Injectable()
export class RedirectsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly cache: RedirectCacheService,
    ) { }

    async resolve(code: string) {
        const snapshot = await this.cache.getOrLoad(code, () =>
            this.loadFromDatabase(code),
        );
        if (!snapshot) {
            throw new NotFoundException('Short link not found');
        }

        this.assertAvailable(snapshot);

        console.log('snapshot.maxVisits', snapshot.maxVisits)
        /**
         * 有严格访问次数限制：
         * 暂时走PG，原子update
         */
        if (snapshot.maxVisits !== null) {
            return await this.resolveLimited(code);
        }

        /**
         * 普通link：
         * Redirect主链路不在写PG
         */
        await this.cache.incrementVisit(snapshot.id, snapshot.visitCount);
        return snapshot.originalUrl;
    }

    private async loadFromDatabase(code: string) {
        const link = await this.prisma.shortLink.findUnique({
            where: {
                code,
            },
            select: {
                id: true,
                originalUrl: true,
                status: true,
                visibility: true,
                expiresAt: true,
                maxVisits: true,
                visitCount: true,
            },
        });
        if (!link) {
            return null;
        }
        return {
            id: link.id,
            originalUrl: link.originalUrl,
            status: link.status,
            visibility: link.visibility,
            expiresAt: link.expiresAt?.toISOString() ?? null,
            maxVisits: link.maxVisits,
            visitCount: link.visitCount,
        };
    }

    //   状态判断
    private assertAvailable(link: RedirectSnapshot) {
        if (link.status !== 'ACTIVE' || link.visibility !== 'PUBLIC') {
            throw new NotFoundException('Short link not found');
        }
        if (link.expiresAt && new Date(link.expiresAt) <= new Date()) {
            throw new HttpException('Short link expired', HttpStatus.GONE);
        }
    }

    private async resolveLimited(code: string) {
        // 把并发约束放进数据库条件本身
        const rows = await this.prisma.$queryRaw<RedirectRow[]>`
          UPDATE "ShortLink"

          SET
            "visitCount" =
              "visitCount" + 1

          WHERE
            "code" = ${code}

            AND
            "status" = 'ACTIVE'

            AND
            "visibility" = 'PUBLIC'

            AND (
              "expiresAt" IS NULL
              OR
              "expiresAt" > NOW()
            )

            AND (
              "maxVisits" IS NULL
              OR
              "visitCount" < "maxVisits"
            )

          RETURNING
            "originalUrl",
            "visitCount"
        `;

        if (rows.length === 1) {
            return rows[0].originalUrl;
        }

        await this.throwUnavailableReason(code);
    }

    private async throwUnavailableReason(code: string): Promise<never> {
        const link = await this.prisma.shortLink.findUnique({
            where: {
                code,
            },

            select: {
                status: true,

                visibility: true,

                expiresAt: true,

                maxVisits: true,

                visitCount: true,
            },
        });

        if (!link) {
            throw new NotFoundException('Short link not found');
        }

        if (
            link.status !== ShortLinkStatus.ACTIVE ||
            link.visibility !== ShortLinkVisibility.PUBLIC
        ) {
            throw new NotFoundException('Short link not found');
        }

        const now = new Date();

        if (link.expiresAt && link.expiresAt <= now) {
            throw new HttpException('Short link expired', HttpStatus.GONE);
        }

        if (link.maxVisits !== null && link.visitCount >= link.maxVisits) {
            throw new HttpException(
                'Short link visit limit reached',
                HttpStatus.GONE,
            );
        }

        throw new NotFoundException('Short link unavailable');
    }
}
