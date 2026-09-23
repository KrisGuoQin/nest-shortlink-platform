import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';

import { RedisClusterService } from '../redis/redis-cluster.service.js';

const SAFE_EXISTS_SCRIPT = `
  if redis.call('EXISTS', KEYS[1]) == 0 then
    return -1
  end

  return redis.call('BF.EXISTS', KEYS[1], ARGV[1])
`;

@Injectable()
export class ShortLinkBloomService {
  private readonly logger = new Logger(ShortLinkBloomService.name);
  private readonly bucketCount = 16;
  /*
   * 每个 bucket 允许约 10 万条，
   * 16 个 bucket 总容量约 160 万。
   */
  private readonly capacityPerBucket = 100_000;
  /*
   * 目标误判率 0.1%。
   */
  private readonly errorRate = 0.001;

  private ready = false;

  constructor(private readonly redis: RedisClusterService) {}

  private getBucket(code: string) {
    const hash = createHash('sha1').update(code).digest();

    return hash[0] % this.bucketCount;
  }

  private getBucketKey(bucket: number) {
    return `bf:short-links:${bucket}`;
  }

  private getKey(code: string) {
    return this.getBucketKey(this.getBucket(code));
  }

  async initializeBuckets() {
    this.markNotReady();

    // enableOfflineQueue=false is what makes request handling fail fast during
    // an outage. During application startup, however, give the initial Cluster
    // handshake a short bounded window before initializing the Bloom buckets.
    await this.redis.waitUntilReady();

    for (let bucket = 0; bucket < this.bucketCount; bucket++) {
      const key = this.getBucketKey(bucket);

      /*
       * BF.RESERVE 不能重复执行。
       * 先检查 key 是否存在。
       */
      const exists = await this.redis.client.exists(key);

      if (exists === 1) {
        continue;
      }

      try {
        await this.redis.client.call(
          'BF.RESERVE',
          key,
          String(this.errorRate),
          String(this.capacityPerBucket),
        );

        this.logger.log(`Bloom bucket created: ${key}`);
      } catch (error) {
        /*
         * 多实例同时启动时可能发生：
         *
         * A 检查不存在
         * B 检查不存在
         * A 创建成功
         * B 创建时得到 already exists
         *
         * 因此 exists 错误可以忽略。
         */
        const message = error instanceof Error ? error.message : String(error);

        if (message.toLowerCase().includes('exists')) {
          continue;
        }

        this.ready = false;
        throw error;
      }
    }
  }

  async add(code: string) {
    const key = this.getKey(code);

    try {
      await this.redis.client.call('BF.ADD', key, code);
    } catch (error) {
      /*
       * 如果数据库写入成功，但 Bloom 写入失败，
       * 继续使用 ready=true 会导致 false negative。
       *
       * 所以本进程立即退回 fail-open 状态。
       */
      this.markNotReady();
      throw error;
    }
  }

  /*
   * 把一批短码按 bucket 分组，
   * 每个 bucket 使用一次 BF.MADD。
   */
  async addMany(codes: string[]) {
    if (codes.length === 0) {
      return;
    }

    const groups = new Map<string, string[]>();

    for (const code of codes) {
      const key = this.getKey(code);

      const group = groups.get(key);

      if (group) {
        group.push(code);
      } else {
        groups.set(key, [code]);
      }
    }

    try {
      for (const [key, bucketCodes] of groups) {
        await this.redis.client.call('BF.MADD', key, ...bucketCodes);
      }
    } catch (error) {
      this.markNotReady();
      throw error;
    }
  }

  async mightContain(code: string): Promise<boolean> {
    if (process.env.BLOOM_FILTER_ENABLED === 'false') {
      return true;
    }

    /*
     * Bloom 还没有初始化时必须 fail-open。
     *
     * 否则服务刚启动：
     *
     * Bloom empty
     * ↓
     * 所有合法短链都被认为不存在
     */
    if (!this.ready) {
      return true;
    }

    try {
      const key = this.getKey(code);

      /*
       * A Redis restart can lose a non-persistent Bloom key while this
       * application process still has ready=true. BF.EXISTS would then return
       * 0 and create a false negative. The script distinguishes a missing
       * bucket (-1) from a genuine negative result (0) in one round trip.
       */
      const result = await this.redis.client.eval(
        SAFE_EXISTS_SCRIPT,
        1,
        key,
        code,
      );

      if (Number(result) === -1) {
        this.markNotReady();
        return true;
      }

      return Number(result) === 1;
    } catch {
      /*
       * Redis/Bloom 故障同样 fail-open。
       *
       * Bloom 是保护 DB 的优化层，
       * 不应该让它成为业务正确性的单点。
       */
      return true;
    }
  }

  markReady() {
    this.ready = true;

    this.logger.log('Short-link Bloom Filter is ready');
  }

  markNotReady() {
    this.ready = false;

    this.logger.warn('Short-link Bloom Filter switched to fail-open');
  }

  isReady() {
    return this.ready;
  }
}
