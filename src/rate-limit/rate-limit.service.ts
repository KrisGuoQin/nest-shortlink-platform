import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service.js';
import {
    FixedWindowConfig,
    RateLimitResult,
    SlidingWindowConfig,
    TokenBucketConfig,
} from './rate-limit.types.js';
import { FIXED_WINDOW_SCRIPT } from './scripts/fixed-window.script.js';
import { SLIDING_WINDOW_SCRIPT } from './scripts/sliding-window.script.js';
import { randomUUID } from 'node:crypto';
import { TOKEN_BUCKET_SCRIPT } from './scripts/token-bucket.script.js';

@Injectable()
export class RateLimitService {
    constructor(private readonly redis: RedisService) { }

    async fixedWindow(
        key: string,
        config: FixedWindowConfig,
    ): Promise<RateLimitResult> {
        const result = await this.redis.client.eval(FIXED_WINDOW_SCRIPT, {
            keys: [key],
            arguments: [String(config.limit), String(config.windowSeconds)],
        });

        return this.parseResult(result);
    }

    async slidingWindow(key: string, config: SlidingWindowConfig) {
        const result = await this.redis.client.eval(SLIDING_WINDOW_SCRIPT, {
            keys: [key],
            arguments: [
                String(config.limit),
                String(config.windowSeconds),
                randomUUID(),
            ],
        });
        return this.parseResult(result);
    }

    async tokenBucket(key: string, config: TokenBucketConfig) {
        const result = await this.redis.client.eval(TOKEN_BUCKET_SCRIPT, {
            keys: [key],
            arguments: [String(config.capacity), String(config.refillPerSecond)],
        });
        return this.parseResult(result);
    }

    async accountFailure(email: string) {
        const normalized = email.trim().toLowerCase();
        const config: FixedWindowConfig = {
            algorithm: 'fixed',
            prefix: 'login-failed',
            keyType: 'user',
            limit: 5,
            windowSeconds: 60 * 10,
        };
        return this.fixedWindow(`rate:login-failed:${normalized}`, config);
    }

    async clearAccountFailure(email: string) {
        await this.redis.client.del(
            `rate:login-failed:${email.trim().toLowerCase()}`,
        );
    }

    private parseResult(raw: unknown): RateLimitResult {
        if (!Array.isArray(raw) || raw.length < 3) {
            throw new Error('invalid rate limit result');
        }

        const [allowed, remaining, retryAfterMs] = raw;

        return {
            allowed: +allowed === 1,
            remaining: +remaining,
            retryAfterMs: +retryAfterMs,
        };
    }
}
