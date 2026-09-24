import { HttpStatus } from '@nestjs/common';

import type { RedirectSnapshot } from '../cache/redirect-cache.service.js';
import { RedirectsService } from './redirects.service.js';

const snapshot: RedirectSnapshot = {
  id: 'link-1',
  code: 'abc12345',
  workspaceId: 'workspace-1',
  createdById: 'user-1',
  originalUrl: 'https://example.com/target',
  status: 'ACTIVE',
  visibility: 'PUBLIC',
  accessVersion: 1,
  expiresAt: null,
  maxVisits: 10,
  visitCount: 0,
};

function createSubject(overrides?: { maxVisits?: number | null }) {
  const link = {
    ...snapshot,
    maxVisits: overrides?.maxVisits === undefined ? 10 : overrides.maxVisits,
  };
  const prisma = {
    $queryRaw: vi
      .fn()
      .mockResolvedValue([{ originalUrl: link.originalUrl, visitCount: 1 }]),
    shortLink: {
      findUnique: vi.fn(),
    },
  };
  const cache = {
    getOrLoad: vi.fn().mockResolvedValue(link),
    incrementVisit: vi.fn().mockResolvedValue(1),
    invalidate: vi.fn().mockResolvedValue(undefined),
  };
  const metrics = {
    redirectTotal: { inc: vi.fn() },
  };
  const service = new RedirectsService(
    prisma as never,
    cache as never,
    {} as never,
    {} as never,
    metrics as never,
  );

  return { service, prisma, cache, metrics, link };
}

describe('RedirectsService visit counting', () => {
  it('marks a max-limited visit as already persisted in PostgreSQL', async () => {
    const { service, prisma, cache } = createSubject({ maxVisits: 10 });

    const result = await service.resolveInternal(snapshot.code);

    expect(result.databaseVisitCountIncremented).toBe(true);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(cache.incrementVisit).not.toHaveBeenCalled();
  });

  it('leaves PostgreSQL counting to the analytics worker for unlimited links', async () => {
    const { service, prisma, cache } = createSubject({ maxVisits: null });

    const result = await service.resolveInternal(snapshot.code);

    expect(result.databaseVisitCountIncremented).toBe(false);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(cache.incrementVisit).toHaveBeenCalledWith(
      snapshot.id,
      snapshot.visitCount,
    );
  });

  it('returns a precise 410 response when the visit limit is exhausted', async () => {
    const { service, prisma, cache, metrics } = createSubject({ maxVisits: 1 });
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.shortLink.findUnique.mockResolvedValue({
      status: 'ACTIVE',
      visibility: 'PUBLIC',
      expiresAt: null,
      maxVisits: 1,
      visitCount: 1,
    });

    await expect(service.resolveInternal(snapshot.code)).rejects.toMatchObject({
      message: 'Short link visit limit reached',
      status: HttpStatus.GONE,
    });
    expect(cache.invalidate).toHaveBeenCalledWith(snapshot.code);
    expect(metrics.redirectTotal.inc).toHaveBeenCalledWith({
      result: 'max_visits_exceeded',
    });
  });
});
