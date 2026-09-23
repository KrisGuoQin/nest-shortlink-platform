import { ShortLinkBloomBootstrapService } from './short-link-bloom-bootstrap.service.js';

describe('ShortLinkBloomBootstrapService', () => {
  it('loads existing short links before marking Bloom ready', async () => {
    const prisma = {
      shortLink: {
        findMany: vi.fn().mockResolvedValueOnce([
          { id: 'id-1', code: 'abc12345' },
          { id: 'id-2', code: 'def12345' },
        ]),
      },
    };
    const bloom = {
      markNotReady: vi.fn(),
      initializeBuckets: vi.fn().mockResolvedValue(undefined),
      addMany: vi.fn().mockResolvedValue(undefined),
      markReady: vi.fn(),
    };
    const service = new ShortLinkBloomBootstrapService(
      prisma as never,
      bloom as never,
    );

    await service.onApplicationBootstrap();

    expect(bloom.markNotReady).toHaveBeenCalled();
    expect(bloom.initializeBuckets).toHaveBeenCalled();
    expect(bloom.addMany).toHaveBeenCalledWith(['abc12345', 'def12345']);
    expect(bloom.markReady).toHaveBeenCalledTimes(1);
  });

  it('keeps Bloom fail-open when initialization fails', async () => {
    const prisma = {
      shortLink: {
        findMany: vi.fn(),
      },
    };
    const bloom = {
      markNotReady: vi.fn(),
      initializeBuckets: vi
        .fn()
        .mockRejectedValue(new Error('Redis unavailable')),
      addMany: vi.fn(),
      markReady: vi.fn(),
    };
    const service = new ShortLinkBloomBootstrapService(
      prisma as never,
      bloom as never,
    );

    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
    expect(bloom.markNotReady).toHaveBeenCalledTimes(2);
    expect(bloom.markReady).not.toHaveBeenCalled();
    expect(prisma.shortLink.findMany).not.toHaveBeenCalled();
  });
});
