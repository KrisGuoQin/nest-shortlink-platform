import {
    ForbiddenException,
    HttpException,
    HttpStatus,
    Injectable,
    NotFoundException,
    UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2'

import {
    ShortLinkStatus,
} from '../generated/prisma/client.js';

import { PrismaService } from '../prisma/prisma.service.js';
import {
    RedirectCacheService,
    type RedirectSnapshot,
} from '../cache/redirect-cache.service.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import { ShareAccessPayload, ShareAccessTokenService } from './share-access-token.service.js';
import { MetricsService } from '../metrics/metrics.service.js';
import { tracer } from '../telemetry/tracing.js';
import { SpanStatusCode } from '@opentelemetry/api';

interface RedirectRow {
    originalUrl: string;
    visitCount: number;
}

export interface RedirectTarget {
    shortLinkId: string;
    workspaceId: string;
    code: string;
    originalUrl: string;
    cacheType?: "hit" | "negative" | "miss";
}

@Injectable()
export class RedirectsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly cache: RedirectCacheService,
        private readonly authorization: AuthorizationService,
        private readonly shareToken: ShareAccessTokenService,
        private readonly metrics: MetricsService,
    ) { }

    async getVisibility(code: string) {
        const snapshot = await this.cache.getOrLoad(code, () =>
            this.loadFromDatabase(code),
        );
        if (!snapshot) {
            this.metrics.redirectTotal.inc({ result: 'not_found' });
            throw new NotFoundException('Short link not found');
        }
        this.assertAvailable(snapshot);
        return snapshot.visibility;
    }

    async resolve(code: string, userId?: string, shareAccessToken?: string) {
        return tracer.startActiveSpan('redirect.resolve', async (span) => {
            try {
                span.setAttribute('shortlink.code', code);
                const result = await this.resolveInternal(code, userId, shareAccessToken);

                span.setAttribute('shortlink.workspaceId', result.workspaceId);
                span.setAttribute('shortlink.cache_result', result.cacheType ?? 'none');
                span.setStatus({ code: SpanStatusCode.OK });
                return result;
            } catch (error) {
                span.recordException(error instanceof Error ? error : new Error(String(error)));
                span.setStatus({ code: SpanStatusCode.ERROR, message: error instanceof Error ? error.message : String(error) });
                throw error;
            } finally {
                span.end();
            }
        })
    }

    async resolveInternal(code: string, userId?: string, shareAccessToken?: string): Promise<RedirectTarget> {
        const snapshot = await this.cache.getOrLoad(code, () =>
            this.loadFromDatabase(code),
        );
        if (!snapshot) {
            this.metrics.redirectTotal.inc({ result: 'not_found' });
            throw new NotFoundException('Short link not found');
        }

        this.assertAvailable(snapshot);

        await this.authorize(snapshot, userId, shareAccessToken);
        /**
         * 有严格访问次数限制：
         * 暂时走PG，原子update
         */
        if (snapshot.maxVisits !== null) {
            await this.resolveLimited(snapshot);
            return {
                shortLinkId: snapshot.id,
                workspaceId: snapshot.workspaceId,
                code: snapshot.code,
                originalUrl: snapshot.originalUrl,
                cacheType: snapshot.cacheType,
            };
        }

        /**
         * 普通link：
         * Redirect主链路不在写PG
         */
        await this.cache.incrementVisit(snapshot.id, snapshot.visitCount);

        return {
            shortLinkId: snapshot.id,
            workspaceId: snapshot.workspaceId,
            code: snapshot.code,
            cacheType: snapshot.cacheType,
            originalUrl: snapshot.originalUrl
        };
    }

    private async loadFromDatabase(code: string) {
        const link = await this.prisma.shortLink.findUnique({
            where: {
                code,
            },
            select: {
                id: true,
                code: true,
                workspaceId: true,
                createdById: true,
                originalUrl: true,
                status: true,
                visibility: true,
                accessVersion: true,
                expiresAt: true,
                maxVisits: true,
                visitCount: true,
            },
        });
        if (!link) {
            return null;
        }
        return {
            ...link,
            expiresAt: link.expiresAt?.toISOString() ?? null,
        };
    }

    //   状态判断
    private assertAvailable(link: RedirectSnapshot) {
        if (link.status !== 'ACTIVE') {
            this.metrics.redirectTotal.inc({ result: 'disabled' });
            throw new NotFoundException('Short link not found');
        }
        if (link.expiresAt && new Date(link.expiresAt) <= new Date()) {
            this.metrics.redirectTotal.inc({ result: 'expired' });
            throw new HttpException('Short link expired', HttpStatus.GONE);
        }
    }

    private async resolveLimited(snapshot: RedirectSnapshot) {
        // 把并发约束放进数据库条件本身
        const rows = await this.prisma.$queryRaw<RedirectRow[]>`
          UPDATE "ShortLink"

          SET
            "visitCount" =
              "visitCount" + 1

          WHERE
            "id" = ${snapshot.id}
            AND
            "code" = ${snapshot.code}
            AND
            "status" = 'ACTIVE'
            AND
            "accessVersion"=${snapshot.accessVersion}
            AND (
              "expiresAt" IS NULL
              OR
              "expiresAt" > NOW()
            )
            AND 
              "maxVisits" IS NOT NULL
            AND
              "visitCount" < "maxVisits"
            
          RETURNING
            "originalUrl",
            "visitCount"
        `;

        if (rows.length === 1) {
            return rows[0].originalUrl;
        }

        await this.cache.invalidate(snapshot.code)

        this.metrics.redirectTotal.inc({ result: 'max_visits_exceeded' });
        throw new HttpException(
            'Short link unavailable or visit limit reached',
            HttpStatus.GONE,
        );
    }

    private async authorize(
        link: RedirectSnapshot,
        userId?: string,
        shareAccessToken?: string,
    ) {
        switch (link.visibility) {
            case 'PUBLIC':
                return;
            case 'WORKSPACE':
                return await this.authorizeWorkspace(link, userId);
            case 'PRIVATE':
                return await this.authorizePrivate(link, userId);
            case 'PASSWORD':
                return await this.authorizePassword(link, userId, shareAccessToken);
        }
    }

    private async authorizeWorkspace(
        link: RedirectSnapshot,
        userId?: string,
    ) {
        if (!userId) {
            throw new UnauthorizedException('Authentication required');
        }

        const access = await this.authorization.getWorkspaceAccess(
            userId,
            link.workspaceId,
        );

        if (!access) {
            throw new NotFoundException('Short link not found');
        }
    }

    private async authorizePrivate(
        link: RedirectSnapshot,

        userId?: string,
    ) {
        if (!userId) {
            throw new UnauthorizedException('Authentication required');
        }

        if (userId !== link.createdById) {
            throw new NotFoundException('Short link not found');
        }
    }

    private async authorizePassword(
        link: RedirectSnapshot,
        _userId?: string,
        token?: string,
    ) {
        if (!token) {
            throw new ForbiddenException('Share password required');
        }

        let payload: ShareAccessPayload;

        try {
            payload = await this.shareToken.verify(token);
        } catch {
            throw new ForbiddenException('Share access expired');
        }

        if (
            payload.linkId !== link.id ||
            payload.code !== link.code ||
            payload.ver !== link.accessVersion
        ) {
            throw new ForbiddenException('Share access invalid');
        }
    }
    async unlock(code: string, password: string) {
        const link = await this.prisma.shortLink.findUnique({
            where: {
                code,
            },
            select: {
                id: true,
                code: true,
                visibility: true,
                status: true,
                passwordHash: true,
                expiresAt: true,
                accessVersion: true,
            },
        });

        if (!link || link.status !== 'ACTIVE' || link.visibility !== 'PASSWORD') {
            throw new NotFoundException('Short link not found');
        }

        if (link.expiresAt && link.expiresAt <= new Date()) {
            throw new HttpException('Short link expired', HttpStatus.GONE);
        }

        if (!link.passwordHash) {
            throw new NotFoundException('Short link unavailable');
        }

        const matched = await argon2.verify(link.passwordHash, password);

        if (!matched) {
            throw new UnauthorizedException('Invalid share password');
        }

        const token = await this.shareToken.sign(
            link.id,
            link.code,
            link.accessVersion,
        );

        return {
            token,
            expiresIn: this.shareToken.getExpiresIn(),
        };
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
            link.status !== ShortLinkStatus.ACTIVE
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
