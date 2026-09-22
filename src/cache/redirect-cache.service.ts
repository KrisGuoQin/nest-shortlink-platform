import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service.js';
import { randomUUID } from 'node:crypto';
import { MetricsService } from '../metrics/metrics.service.js';

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
    cacheType?: "hit" | "negative" | "miss";
}

type Loader = () => Promise<RedirectSnapshot | null>;

const NEGATIVE_CACHE = '__NOT_FOUND__';

@Injectable()
export class RedirectCacheService {
    private readonly logger = new Logger(RedirectCacheService.name);
    private readonly CACHE_TTL_SECONDS = 300;
    private readonly NEGATIVE_TTL_SECONDS = 30;
    private readonly LOCK_TTL_MS = 3_000;

    constructor(
        private readonly redis: RedisService,
        private readonly metrics: MetricsService,
    ) { }

    private cacheKey(code: string) {
        return `redirect:v2:${code}`;
    }
    private lockKey(code: string) {
        return `redirect:lock:${code}`;
    }
    private visitKey(linkId: string) {
        return `stats:link:${linkId}:visits`;
    }

    /**
     * 删除缓存
     * @param code
     */
    async invalidate(code: string) {
        try {
            await this.redis.client.del(this.cacheKey(code));
        } catch (error) {
            this.logger.warn(`Cache invalidate failed: ${code}`);
        }
    }

    async deleteStats(linkId: string) {
        try {
            await this.redis.client.del(this.visitKey(linkId));
        } catch (error) { }
    }

    async getOrLoad(code: string, loader: Loader): Promise<RedirectSnapshot | null> {
        try {
            const cached = await this.readCache(code);

            this.logger.log(`cached: ${cached.type}`);

            this.metrics.redirectCacheTotal.inc({ result: cached.type });

            if (cached.type === 'hit') {
                return {
                    ...cached.value,
                    cacheType: cached.type,
                };
            }
            if (cached.type === 'negative') {
                return null;
            }

            const result = await this.loadWithLock(code, loader);
            if (!result) {
                return null;
            }

            return {
                ...result,
                cacheType: cached.type,
            };
        } catch (error) {
            this.logger.warn(`Redis unavailable, falling back to DB for ${code}`);

            const result = await loader();
            if (!result) {
                return null;
            }

            return {
                ...result,
                cacheType: 'miss',
            };
        }
    }

    /**
     * 读缓存
     * @param code
     * @returns
     */
    private async readCache(code: string): Promise<
        | {
            type: 'hit';
            value: RedirectSnapshot;
        }
        | {
            type: 'negative';
        }
        | {
            type: 'miss';
        }
    > {
        const value = await this.redis.client.get(this.cacheKey(code));
        if (!value) {
            return {
                type: 'miss',
            };
        }
        if (value === NEGATIVE_CACHE) {
            return {
                type: 'negative',
            };
        }
        return {
            type: 'hit',
            value: JSON.parse(value) as RedirectSnapshot,
        };
    }

    /**
     * 写入缓存
     * @param code
     * @param snapshot
     */
    private async setSnapshot(code: string, snapshot: RedirectSnapshot) {
        const ttl = this.calculateTtl(snapshot);
        this.logger.log(`set-snapshot: ${snapshot.code}`);

        await this.redis.client.set(this.cacheKey(code), JSON.stringify(snapshot), {
            expiration: {
                type: 'EX',
                value: ttl,
            },
        });
    }

    private async setNegative(code: string) {
        // 防止缓存击穿
        await this.redis.client.set(this.cacheKey(code), NEGATIVE_CACHE, {
            expiration: {
                type: 'EX',
                value: this.NEGATIVE_TTL_SECONDS,
            },
        });
    }

    private async loadWithLock(code: string, loader: Loader) {
        const lockKey = this.lockKey(code);
        const token = randomUUID();
        const acquired = await this.redis.client.set(lockKey, token, {
            condition: 'NX',
            expiration: {
                type: 'PX',
                value: this.LOCK_TTL_MS,
            },
        });

        // 抢到锁
        if (acquired === 'OK') {
            try {
                // 双重检查
                const cached = await this.readCache(code);

                if (cached.type === 'hit') {
                    return cached.value;
                }
                if (cached.type === 'negative') {
                    return null;
                }

                // 从数据库中查找
                const value = await loader();
                // 数据库中都没有，设置为not found,过期时间较短的
                if (!value) {
                    await this.setNegative(code);
                    return null;
                }
                // 找到了，设置缓存
                await this.setSnapshot(code, value);
                return value;
            } finally {
                await this.releaseLock(lockKey, token);
            }
        }

        // 没抢到锁，等拥有锁的请求把cache填好
        for (let attempt = 0; attempt < 10; attempt++) {
            await this.sleep(50);

            const cached = await this.readCache(code);
            if (cached.type === 'hit') {
                return cached.value;
            }
            if (cached.type === 'negative') {
                return null;
            }
        }

        // 为避免缓存系统故障
        // 让请求一直失败，最终fallback DB
        return loader();
    }

    async releaseLock(lockKey: string, token: string) {
        const script = `
            if redis.call(
                "GET",
                KEYS[1]
            ) == ARGV[1]
            then
                return redis.call(
                    "DEL",
                    KEYS[1]
                )
            else
                return 0
            end
        `;

        try {
            await this.redis.client.eval(script, {
                keys: [lockKey],
                arguments: [token],
            });
        } catch (error) {
            // LOCK本身有TTL
            // 即使释放失败最终也会过期
        }
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
        } catch (error) {
            /*
             * Analytics 失败
             * 不应该导致 Redirect 失败。
             */
            this.logger.warn(`Visit counter failed: ${linkId}`);

            return null;
        }
    }

    private calculateTtl(snapshot: RedirectSnapshot) {
        // 随机抖动，防止缓存雪崩
        const jitter = Math.floor(Math.random() * 60);

        let ttl = this.CACHE_TTL_SECONDS + jitter;

        if (snapshot.expiresAt) {
            const remaining = Math.floor(
                (new Date(snapshot.expiresAt).getTime() - Date.now()) / 1000,
            );

            if (remaining <= 0) {
                return 1;
            }

            ttl = Math.min(ttl, remaining);
        }

        return Math.max(1, ttl);
    }

    private sleep(ms: number) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
