import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { RedisClusterService } from '../redis/redis-cluster.service.js';
import { HotCacheService } from './hot-cache.service.js';
import { ShortLinkBloomService } from './short-link-bloom.service.js';

const NULL_VALUE = '__NULL__';
export type CacheLayer = 'l1' | 'l2' | 'db' | 'negative' | 'bloom-negative';

export interface CacheResolveResult {
  value: string | null;
  layer: CacheLayer;
}

@Injectable()
export class ShortLinkResolveCacheService {
  private get l1Enabled() {
    return process.env.L1_CACHE_ENABLED !== 'false';
  }

  private setLocal(key: string, value: string | null) {
    if (this.l1Enabled) {
      this.hotCache.set(key, value, 2_000);
    }
  }

  private cacheKey(code: string) {
    return `cache:short-link:{${code}}`;
  }

  private lockKey(code: string) {
    return `lock:short-link:{${code}}`;
  }

  constructor(
    private readonly redis: RedisClusterService,
    private readonly hotCache: HotCacheService,
    private readonly bloom: ShortLinkBloomService,
  ) {}

  async resolve(
    code: string,
    loader: () => Promise<string | null>,
  ): Promise<CacheResolveResult> {
    const cacheKey = this.cacheKey(code);

    const lockKey = this.lockKey(code);

    /*
     * ==================================
     * 1. L1 Local Cache
     * ==================================
     */

    const local = this.l1Enabled
      ? this.hotCache.get<string | null>(cacheKey)
      : undefined;

    if (local !== undefined) {
      return {
        value: local,
        layer: 'l1',
      };
    }

    /*
     * ==================================
     * 2. Bloom Filter
     * ==================================
     */

    const mightExist = await this.bloom.mightContain(code);

    if (!mightExist) {
      return {
        value: null,
        layer: 'bloom-negative',
      };
    }

    /*
     * ==================================
     * 3. Redis L2 Cache
     * ==================================
     */

    const cached = await this.redis.get(cacheKey);

    if (cached !== null) {
      const value = cached === NULL_VALUE ? null : cached;

      this.setLocal(cacheKey, value);

      return {
        value,
        layer: value === null ? 'negative' : 'l2',
      };
    }

    /*
     * ==================================
     * 4. Distributed Lock
     * ==================================
     */

    const token = randomUUID();

    const locked = await this.redis.acquireLock(lockKey, token, 5000);

    if (!locked) {
      return this.waitForCache(cacheKey, loader);
    }

    try {
      /*
       * Double Check
       *
       * 获得锁前，
       * 可能其他请求已经重建缓存。
       */

      const cachedAgain = await this.redis.get(cacheKey);

      if (cachedAgain !== null) {
        return cachedAgain === NULL_VALUE
          ? {
              value: null,
              layer: 'negative',
            }
          : {
              value: cachedAgain,
              layer: 'l2',
            };
      }

      /*
       * ==================================
       * 5. Database
       * ==================================
       */

      const value = await loader();

      /*
       * 数据不存在
       *
       * 即使 Bloom 出现 false positive，
       * 也用短 TTL null cache 保护 DB。
       */

      if (value === null) {
        await this.redis.set(cacheKey, NULL_VALUE, 30);

        this.setLocal(cacheKey, null);

        return {
          value: null,
          layer: 'db',
        };
      }

      /*
       * ==================================
       * 6. TTL + Jitter
       * ==================================
       */

      const ttl = 300 + Math.floor(Math.random() * 60);

      await this.redis.set(cacheKey, value, ttl);

      this.setLocal(cacheKey, value);

      return {
        value,
        layer: 'db',
      };
    } finally {
      try {
        await this.redis.releaseLock(lockKey, token);
      } catch {
        /*
         * The lock has a TTL. Unlock failure must not overwrite a
         * successful database/cache result.
         */
      }
    }
  }

  async invalidate(code: string) {
    const key = this.cacheKey(code);

    this.hotCache.delete(key);
    await this.redis.delete(key);
  }

  private async waitForCache(
    cacheKey: string,
    loader: () => Promise<string | null>,
  ): Promise<CacheResolveResult> {
    /*
     * 最多等待约 2 秒。
     */

    for (let i = 0; i < 40; i++) {
      await this.sleep(40 + Math.floor(Math.random() * 20));

      const cached = await this.redis.get(cacheKey);

      if (cached !== null) {
        const value = cached === NULL_VALUE ? null : cached;
        this.setLocal(cacheKey, value);
        return {
          value,
          layer: value === null ? 'negative' : 'l2',
        };
      }
    }

    /*
     * 锁持有者异常或者 DB 极慢时：
     * 优先保证业务可用。
     */
    const value = await loader();

    return {
      value,
      layer: 'db',
    };
  }

  private sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
  }
}
