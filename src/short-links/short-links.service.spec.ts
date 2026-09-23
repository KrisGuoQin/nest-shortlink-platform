import 'reflect-metadata';

import { CreateShortLinkDto } from './dto/create-short-link.dto.js';
import { ShortLinksService } from './short-links.service.js';

function createSubject(options?: { bloomError?: Error }) {
  const link = {
    id: 'link-1',
    workspaceId: 'workspace-1',
    createdById: 'user-1',
    code: 'abc12345',
    originalUrl: 'https://example.com',
  };
  const prisma = {
    shortLink: {
      create: vi.fn().mockResolvedValue(link),
    },
  };
  const config = {
    getOrThrow: vi.fn().mockReturnValue('http://localhost:3000/r'),
  };
  const cache = {
    invalidate: vi.fn().mockResolvedValue(undefined),
  };
  const bloom = {
    add: options?.bloomError
      ? vi.fn().mockRejectedValue(options.bloomError)
      : vi.fn().mockResolvedValue(undefined),
  };
  const service = new ShortLinksService(
    prisma as never,
    config as never,
    cache as never,
    {} as never,
    bloom as never,
  );

  return {
    service,
    link,
    cache,
    bloom,
  };
}

describe('ShortLinksService Bloom synchronization', () => {
  it('adds a newly created short code before invalidating negative cache', async () => {
    const { service, link, cache, bloom } = createSubject();
    const dto = new CreateShortLinkDto();
    dto.originalUrl = link.originalUrl;

    await service.create('workspace-1', 'user-1', dto);

    expect(bloom.add).toHaveBeenCalledWith(link.code);
    expect(cache.invalidate).toHaveBeenCalledWith(link.code);
    expect(bloom.add.mock.invocationCallOrder[0]).toBeLessThan(
      cache.invalidate.mock.invocationCallOrder[0],
    );
  });

  it('keeps a successful database insert successful when Bloom is unavailable', async () => {
    const { service, link, cache, bloom } = createSubject({
      bloomError: new Error('Redis unavailable'),
    });
    const dto = new CreateShortLinkDto();
    dto.originalUrl = link.originalUrl;

    const result = await service.create('workspace-1', 'user-1', dto);

    expect(result.code).toBe(link.code);
    expect(bloom.add).toHaveBeenCalledWith(link.code);
    expect(cache.invalidate).toHaveBeenCalledWith(link.code);
  });
});
