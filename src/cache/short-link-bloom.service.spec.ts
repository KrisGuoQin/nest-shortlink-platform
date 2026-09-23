import { ShortLinkBloomService } from './short-link-bloom.service.js';

function createRedisMock() {
  return {
    waitUntilReady: vi.fn().mockResolvedValue(undefined),
    client: {
      exists: vi.fn(),
      call: vi.fn(),
      eval: vi.fn(),
    },
  };
}

describe('ShortLinkBloomService', () => {
  it('fails open before initialization', async () => {
    const redis = createRedisMock();
    const service = new ShortLinkBloomService(redis as never);

    await expect(service.mightContain('abc12345')).resolves.toBe(true);
    expect(redis.client.call).not.toHaveBeenCalled();
  });

  it('creates all missing Bloom buckets', async () => {
    const redis = createRedisMock();
    redis.client.exists.mockResolvedValue(0);
    redis.client.call.mockResolvedValue('OK');
    const service = new ShortLinkBloomService(redis as never);

    await service.initializeBuckets();

    expect(redis.waitUntilReady).toHaveBeenCalledTimes(1);
    expect(redis.client.exists).toHaveBeenCalledTimes(16);
    expect(redis.client.call).toHaveBeenCalledTimes(16);
    expect(redis.client.call).toHaveBeenCalledWith(
      'BF.RESERVE',
      'bf:short-links:0',
      '0.001',
      '100000',
    );
    expect(service.isReady()).toBe(false);
  });

  it('groups a batch by bucket and uses BF.MADD', async () => {
    const redis = createRedisMock();
    redis.client.call.mockResolvedValue(1);
    const service = new ShortLinkBloomService(redis as never);
    const codes = ['abc12345', 'def12345', 'ghi12345', 'jkl12345'];

    await service.addMany(codes);

    const calls = redis.client.call.mock.calls;
    expect(calls.every(([command]) => command === 'BF.MADD')).toBe(true);

    const addedCodes = calls
      .flatMap(([, , ...bucketCodes]) => bucketCodes)
      .sort((left, right) => String(left).localeCompare(String(right)));

    expect(addedCodes).toEqual(
      [...codes].sort((left, right) => left.localeCompare(right)),
    );
  });

  it('switches back to fail-open when adding a code fails', async () => {
    const redis = createRedisMock();
    redis.client.call.mockRejectedValue(new Error('Redis unavailable'));
    const service = new ShortLinkBloomService(redis as never);
    service.markReady();

    await expect(service.add('abc12345')).rejects.toThrow('Redis unavailable');
    expect(service.isReady()).toBe(false);
    await expect(service.mightContain('abc12345')).resolves.toBe(true);
  });

  it('fails open when a ready Bloom bucket disappeared', async () => {
    const redis = createRedisMock();
    redis.client.eval.mockResolvedValue(-1);
    const service = new ShortLinkBloomService(redis as never);
    service.markReady();

    await expect(service.mightContain('abc12345')).resolves.toBe(true);
    expect(service.isReady()).toBe(false);
  });
});
