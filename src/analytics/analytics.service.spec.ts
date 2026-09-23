import 'reflect-metadata';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AnalyticsService } from './analytics.service.js';
import { QueryAnalyticsDto } from './dto/query-analytics.dto.js';

function createSubject() {
  const prisma = {
    $queryRaw: vi.fn(),
    shortLink: {
      findFirst: vi.fn(),
    },
  };
  return {
    service: new AnalyticsService(prisma as never),
    prisma,
  };
}

describe('AnalyticsService', () => {
  it('returns workspace metrics and converts database bigint counts to JSON-safe numbers', async () => {
    const { service, prisma } = createSubject();
    prisma.$queryRaw
      .mockResolvedValueOnce([{ clicks: 8n, uniqueIps: 3n }])
      .mockResolvedValueOnce([
        { bucket: '2026-09-22', clicks: 8n, uniqueIps: 3n },
      ])
      .mockResolvedValueOnce([{ value: 'example.com', clicks: 5n }])
      .mockResolvedValueOnce([{ value: 'desktop', clicks: 6n }])
      .mockResolvedValueOnce([{ value: 'Chrome', clicks: 6n }])
      .mockResolvedValueOnce([
        {
          shortLinkId: 'link-1',
          shortCode: 'abc12345',
          title: 'Example',
          clicks: 8n,
        },
      ]);

    const result = await service.getWorkspaceOverview('workspace-1', {
      from: '2026-09-01T00:00:00.000Z',
      to: '2026-09-23T00:00:00.000Z',
      granularity: 'day',
      timezone: 'UTC',
    });

    expect(result.summary.clicks).toBe(8);
    expect(result.summary.uniqueIps).toBe(3);
    expect(result.timeSeries[0].clicks).toBe(8);
    expect(result.referrers[0]).toEqual({ value: 'example.com', clicks: 5 });
    expect(result.topLinks[0].shortCode).toBe('abc12345');
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(6);
  });

  it('rejects a range whose start is not earlier than its end', async () => {
    const { service, prisma } = createSubject();

    await expect(
      service.getWorkspaceOverview('workspace-1', {
        from: '2026-09-23T00:00:00.000Z',
        to: '2026-09-23T00:00:00.000Z',
        granularity: 'day',
        timezone: 'UTC',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('limits hourly queries to seven days', async () => {
    const { service, prisma } = createSubject();

    await expect(
      service.getWorkspaceOverview('workspace-1', {
        from: '2026-09-01T00:00:00.000Z',
        to: '2026-09-10T00:00:00.000Z',
        granularity: 'hour',
        timezone: 'UTC',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('rejects invalid time zones before querying', async () => {
    const { service, prisma } = createSubject();

    await expect(
      service.getWorkspaceOverview('workspace-1', {
        from: '2026-09-01T00:00:00.000Z',
        to: '2026-09-02T00:00:00.000Z',
        granularity: 'day',
        timezone: 'Not/A_Timezone',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('does not expose analytics for a link outside the requested workspace', async () => {
    const { service, prisma } = createSubject();
    prisma.shortLink.findFirst.mockResolvedValue(null);

    await expect(
      service.getShortLinkAnalytics(
        'workspace-1',
        'link-2',
        new QueryAnalyticsDto(),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.shortLink.findFirst).toHaveBeenCalledWith({
      where: { id: 'link-2', workspaceId: 'workspace-1' },
      select: { id: true, code: true, title: true },
    });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});
