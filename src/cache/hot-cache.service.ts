import { Injectable } from '@nestjs/common';

interface CacheItem<T> {
    value: T;
    expireAt: number;
}

// L1 local cache
@Injectable()
export class HotCacheService {
    private readonly cache = new Map<string, CacheItem<unknown>>();

    get<T>(key: string): T | undefined {
        const item = this.cache.get(key);

        if (!item) {
            return undefined;
        }

        if (Date.now() >= item.expireAt) {
            this.cache.delete(key);

            return undefined;
        }

        return item.value as T;
    }

    set<T>(key: string, value: T, ttlMs: number) {
        this.cache.set(key, {
            value,
            expireAt: Date.now() + ttlMs,
        });
    }

    delete(key: string) {
        this.cache.delete(key);
    }
}
