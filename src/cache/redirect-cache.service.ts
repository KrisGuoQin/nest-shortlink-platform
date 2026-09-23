import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service.js';
import { MetricsService } from '../metrics/metrics.service.js';
import { ShortLinkResolveCacheService } from './short-link-resolve-cache.service.js';
import { RedisClusterService } from '../redis/redis-cluster.service.js';
import { CacheCircuitBreakerService } from './cache-circuit-breaker.service.js';

export interface RedirectSnapshot {
  id: string;
  code: string;
  workspaceId: string;
  createdById: string;
  originalUrl: string;
  status: 'ACTIVE' | 'DISABLED';
  visibility: 'PUBLIC' | 'WORKSPACE' | 'PRIVATE' | 'PASSWORD';
  accessVersion: number;
  expiresAt: string | null;
  maxVisits: number | null;
  visitCount: number;
  cacheType?: 'hit' | 'negative' | 'miss';
}

type Loader = () => Promise<RedirectSnapshot | null>;

@Injectable()
export class RedirectCacheService {
  private readonly logger = new Logger(RedirectCacheService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly metrics: MetricsService,
    private readonly resolveCache: ShortLinkResolveCacheService,
    private readonly redisCluster: RedisClusterService,
    private readonly cacheCircuitBreaker: CacheCircuitBreakerService,
  ) {}

  private visitKey(linkId: string) {
    return `stats:link:${linkId}:visits`;
  }

  async getOrLoad(
    code: string,
    loader: Loader,
  ): Promise<RedirectSnapshot | null> {
    const permit = this.cacheCircuitBreaker.acquire();

    if (permit === 'bypass') {
      this.metrics.redirectCacheTotal.inc({ result: 'circuit-open' });
      return this.loadFromDatabase(loader);
    }

    let databaseLoaderFailed = false;

    try {
      if (permit === 'probe') {
        await this.redisCluster.ping();
      }

      const cached = await this.resolveCache.resolve(code, async () => {
        let snapshot: RedirectSnapshot | null;
        try {
          snapshot = await loader();
        } catch (error) {
          databaseLoaderFailed = true;
          throw error;
        }

        return snapshot ? JSON.stringify(snapshot) : null;
      });

      this.cacheCircuitBreaker.recordSuccess();
      this.metrics.redirectCacheTotal.inc({ result: cached.layer });

      if (cached.value === null) {
        return null;
      }
      const snapshot = JSON.parse(cached.value) as RedirectSnapshot;

      return {
        ...snapshot,
        cacheType: cached.layer === 'db' ? 'miss' : 'hit',
      };
    } catch (error) {
      if (databaseLoaderFailed) {
        throw error;
      }

      this.cacheCircuitBreaker.recordFailure();
      this.metrics.redirectCacheTotal.inc({ result: 'redis-error' });
      this.logger.warn(`Redis unavailable, falling back to DB for ${code}`);
      return this.loadFromDatabase(loader);
    }
  }

  private async loadFromDatabase(loader: Loader) {
    const result = await loader();
    if (!result) {
      return null;
    }

    return {
      ...result,
      cacheType: 'miss' as const,
    };
  }

  /**
   * 删除缓存
   * @param code
   */
  async invalidate(code: string) {
    try {
      await this.resolveCache.invalidate(code);
    } catch {
      this.logger.warn(`Cache invalidate failed: ${code}`);
    }
  }

  async deleteStats(linkId: string) {
    try {
      await this.redis.client.del(this.visitKey(linkId));
    } catch {}
  }

  async incrementVisit(linkId: string, databaseBaseline: number) {
    const script = `
            if redis.call(
                "EXISTS",
                KEYS[1]
            ) == 0
            then
            redis.call(
                "SET",
                KEYS[1],
                ARGV[1]
            )
            end

            return redis.call(
                "INCR",
                KEYS[1]
            )
        `;

    try {
      return await this.redis.client.eval(script, {
        keys: [this.visitKey(linkId)],
        arguments: [databaseBaseline.toString()],
      });
    } catch {
      /*
       * Analytics 失败
       * 不应该导致 Redirect 失败。
       */
      this.logger.warn(`Visit counter failed: ${linkId}`);

      return null;
    }
  }
}
