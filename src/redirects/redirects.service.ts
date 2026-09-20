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

interface RedirectRow {
    originalUrl: string;

    visitCount: number;
}

@Injectable()
export class RedirectsService {
    constructor(private readonly prisma: PrismaService) { }

    async resolve(code: string) {
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
