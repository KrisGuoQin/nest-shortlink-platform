import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { QueryAnalyticsDto } from './dto/query-analytics.dto.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RANGE_DAYS = 30;
const MAX_RANGE_DAYS = 90;
const MAX_HOURLY_RANGE_DAYS = 7;

interface CountRow {
  clicks: bigint;
  uniqueIps: bigint;
}

interface TimeSeriesRow extends CountRow {
  bucket: string;
}

interface DimensionRow {
  value: string;
  clicks: bigint;
}

interface TopLinkRow extends DimensionRow {
  shortLinkId: string;
  shortCode: string;
  title: string | null;
}

interface AnalyticsRange {
  from: Date;
  to: Date;
  timezone: string;
  granularity: 'hour' | 'day';
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getWorkspaceOverview(workspaceId: string, query: QueryAnalyticsDto) {
    const range = this.resolveRange(query);
    const where = this.where(workspaceId, range);

    const [summary, timeSeries, referrers, devices, browsers, topLinks] =
      await Promise.all([
        this.summary(where),
        this.timeSeries(where, range),
        this.dimensionCounts(where, this.referrerExpression()),
        this.dimensionCounts(where, this.deviceExpression()),
        this.dimensionCounts(where, this.browserExpression()),
        this.topLinks(workspaceId, range),
      ]);

    return {
      range: this.presentRange(range),
      summary,
      timeSeries,
      referrers,
      devices,
      browsers,
      topLinks,
    };
  }

  async getShortLinkAnalytics(
    workspaceId: string,
    shortLinkId: string,
    query: QueryAnalyticsDto,
  ) {
    const link = await this.prisma.shortLink.findFirst({
      where: { id: shortLinkId, workspaceId },
      select: { id: true, code: true, title: true },
    });
    if (!link) {
      throw new NotFoundException('Short link not found');
    }

    const range = this.resolveRange(query);
    const where = this.where(workspaceId, range, shortLinkId);
    const [summary, timeSeries, referrers, devices, browsers] =
      await Promise.all([
        this.summary(where),
        this.timeSeries(where, range),
        this.dimensionCounts(where, this.referrerExpression()),
        this.dimensionCounts(where, this.deviceExpression()),
        this.dimensionCounts(where, this.browserExpression()),
      ]);

    return {
      link,
      range: this.presentRange(range),
      summary,
      timeSeries,
      referrers,
      devices,
      browsers,
    };
  }

  private resolveRange(query: QueryAnalyticsDto): AnalyticsRange {
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from
      ? new Date(query.from)
      : new Date(to.getTime() - DEFAULT_RANGE_DAYS * DAY_MS);

    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) {
      throw new BadRequestException('from and to must be valid ISO-8601 dates');
    }
    if (from >= to) {
      throw new BadRequestException('from must be earlier than to');
    }

    const rangeDays = (to.getTime() - from.getTime()) / DAY_MS;
    const maxDays =
      query.granularity === 'hour' ? MAX_HOURLY_RANGE_DAYS : MAX_RANGE_DAYS;
    if (rangeDays > maxDays) {
      throw new BadRequestException(
        `The selected range cannot exceed ${maxDays} days for ${query.granularity} granularity`,
      );
    }

    try {
      new Intl.DateTimeFormat('en-US', { timeZone: query.timezone }).format(to);
    } catch {
      throw new BadRequestException('timezone must be a valid IANA time zone');
    }

    return {
      from,
      to,
      timezone: query.timezone,
      granularity: query.granularity,
    };
  }

  private where(
    workspaceId: string,
    range: AnalyticsRange,
    shortLinkId?: string,
  ) {
    return Prisma.sql`
      visit."workspaceId" = ${workspaceId}
      AND visit."visitedAt" >= ${range.from}
      AND visit."visitedAt" < ${range.to}
      ${shortLinkId ? Prisma.sql`AND visit."shortLinkId" = ${shortLinkId}` : Prisma.empty}
    `;
  }

  private async summary(where: Prisma.Sql) {
    const [row] = await this.prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT
        COUNT(*)::bigint AS "clicks",
        COUNT(DISTINCT visit."ipHash")::bigint AS "uniqueIps"
      FROM "ShortLinkVisit" AS visit
      WHERE ${where}
    `);

    return {
      clicks: Number(row?.clicks ?? 0n),
      uniqueIps: Number(row?.uniqueIps ?? 0n),
      uniqueIpsDefinition: 'distinct hashed IP addresses; not distinct people',
    };
  }

  private async timeSeries(where: Prisma.Sql, range: AnalyticsRange) {
    const rows = await this.prisma.$queryRaw<TimeSeriesRow[]>(Prisma.sql`
      SELECT
        to_char(
          date_trunc(${range.granularity}, visit."visitedAt" AT TIME ZONE ${range.timezone}),
          ${range.granularity === 'day' ? 'YYYY-MM-DD' : 'YYYY-MM-DD"T"HH24:00:00'}
        ) AS "bucket",
        COUNT(*)::bigint AS "clicks",
        COUNT(DISTINCT visit."ipHash")::bigint AS "uniqueIps"
      FROM "ShortLinkVisit" AS visit
      WHERE ${where}
      GROUP BY 1
      ORDER BY 1 ASC
    `);

    return rows.map((row) => ({
      bucket: row.bucket,
      clicks: Number(row.clicks),
      uniqueIps: Number(row.uniqueIps),
    }));
  }

  private async dimensionCounts(where: Prisma.Sql, expression: Prisma.Sql) {
    const rows = await this.prisma.$queryRaw<DimensionRow[]>(Prisma.sql`
      SELECT ${expression} AS "value", COUNT(*)::bigint AS "clicks"
      FROM "ShortLinkVisit" AS visit
      WHERE ${where}
      GROUP BY 1
      ORDER BY "clicks" DESC, "value" ASC
      LIMIT 10
    `);

    return rows.map((row) => ({
      value: row.value,
      clicks: Number(row.clicks),
    }));
  }

  private async topLinks(workspaceId: string, range: AnalyticsRange) {
    const rows = await this.prisma.$queryRaw<TopLinkRow[]>(Prisma.sql`
      SELECT
        link.id AS "shortLinkId",
        link.code AS "shortCode",
        link.title AS "title",
        COUNT(*)::bigint AS "clicks"
      FROM "ShortLinkVisit" AS visit
      INNER JOIN "ShortLink" AS link
        ON link.id = visit."shortLinkId"
        AND link."workspaceId" = ${workspaceId}
      WHERE visit."workspaceId" = ${workspaceId}
        AND visit."visitedAt" >= ${range.from}
        AND visit."visitedAt" < ${range.to}
      GROUP BY link.id, link.code, link.title
      ORDER BY "clicks" DESC, link.code ASC
      LIMIT 10
    `);

    return rows.map((row) => ({
      shortLinkId: row.shortLinkId,
      shortCode: row.shortCode,
      title: row.title,
      clicks: Number(row.clicks),
    }));
  }

  private referrerExpression() {
    return Prisma.sql`
      CASE
        WHEN visit."referer" IS NULL OR visit."referer" = '' THEN 'direct'
        ELSE COALESCE(
          substring(lower(visit."referer") from '^https?://([^/:?#]+)'),
          'other'
        )
      END
    `;
  }

  private deviceExpression() {
    return Prisma.sql`
      CASE
        WHEN visit."userAgent" ILIKE '%bot%' OR visit."userAgent" ILIKE '%crawler%' THEN 'bot'
        WHEN visit."userAgent" ILIKE '%ipad%' OR visit."userAgent" ILIKE '%tablet%' THEN 'tablet'
        WHEN visit."userAgent" ILIKE '%mobile%' OR visit."userAgent" ILIKE '%android%' OR visit."userAgent" ILIKE '%iphone%' THEN 'mobile'
        WHEN visit."userAgent" IS NULL OR visit."userAgent" = '' THEN 'unknown'
        ELSE 'desktop'
      END
    `;
  }

  private browserExpression() {
    return Prisma.sql`
      CASE
        WHEN visit."userAgent" ILIKE '%edg/%' THEN 'Edge'
        WHEN visit."userAgent" ILIKE '%opr/%' OR visit."userAgent" ILIKE '%opera%' THEN 'Opera'
        WHEN visit."userAgent" ILIKE '%firefox/%' THEN 'Firefox'
        WHEN visit."userAgent" ILIKE '%chrome/%' AND visit."userAgent" NOT ILIKE '%edg/%' THEN 'Chrome'
        WHEN visit."userAgent" ILIKE '%safari/%' AND visit."userAgent" NOT ILIKE '%chrome/%' THEN 'Safari'
        WHEN visit."userAgent" IS NULL OR visit."userAgent" = '' THEN 'unknown'
        ELSE 'other'
      END
    `;
  }

  private presentRange(range: AnalyticsRange) {
    return {
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      timezone: range.timezone,
      granularity: range.granularity,
    };
  }
}
