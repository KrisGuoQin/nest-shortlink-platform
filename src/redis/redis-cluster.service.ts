import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';

import { Cluster } from 'ioredis';

import { REDIS_CLUSTER } from './redis.constants.js';

@Injectable()
export class RedisClusterService implements OnModuleDestroy {
  constructor(
    @Inject(REDIS_CLUSTER)
    public readonly client: Cluster,
  ) {}

  async waitUntilReady(timeoutMs = 2_000) {
    if (this.client.status === 'ready') {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const onReady = () => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        this.client.off('ready', onReady);
        reject(new Error(`Redis Cluster was not ready within ${timeoutMs}ms`));
      }, timeoutMs);

      this.client.once('ready', onReady);

      // Close the small race between the status check above and
      // registering the event listener.
      if (this.client.status === 'ready') {
        this.client.off('ready', onReady);
        onReady();
      }
    });
  }

  async get(key: string) {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number) {
    if (ttlSeconds) {
      return this.client.set(key, value, 'EX', ttlSeconds);
    }

    return this.client.set(key, value);
  }

  async delete(key: string) {
    return this.client.del(key);
  }

  async acquireLock(key: string, token: string, ttlMs: number) {
    const result = await this.client.set(key, token, 'PX', ttlMs, 'NX');

    return result === 'OK';
  }

  async releaseLock(key: string, token: string) {
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      end

      return 0
    `;

    return this.client.eval(script, 1, key, token);
  }

  async onModuleDestroy() {
    await this.client.quit();
  }
}
