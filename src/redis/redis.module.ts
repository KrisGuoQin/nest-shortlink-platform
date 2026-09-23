import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cluster } from 'ioredis';

import { RedisService } from './redis.service.js';
import { REDIS_CLUSTER } from './redis.constants.js';
import { RedisClusterService } from './redis-cluster.service.js';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLUSTER,
      inject: [ConfigService],
      useFactory(config: ConfigService) {
        const logger = new Logger('RedisCluster');
        const rawNodes =
          config.get<string>('REDIS_CLUSTER_NODES') ??
          '127.0.0.1:7100,127.0.0.1:7101,127.0.0.1:7102';
        const nodes = rawNodes.split(',').map((entry) => {
          const [host, rawPort] = entry.trim().split(':');
          const port = Number(rawPort);

          if (!host || !Number.isInteger(port) || port <= 0) {
            throw new Error(`Invalid Redis Cluster node: ${entry}`);
          }

          return { host, port };
        });
        const cluster = new Cluster(nodes, {
          // During an outage, reject new commands immediately instead of
          // retaining HTTP requests in ioredis' offline queue. The cache
          // caller can then fail open to PostgreSQL while Cluster reconnects
          // in the background.
          enableOfflineQueue: false,
          slotsRefreshTimeout: 2000,
          retryDelayOnFailover: 100,
          redisOptions: {
            connectTimeout: 1000,
            commandTimeout: 300,
            maxRetriesPerRequest: 1,
          },
          clusterRetryStrategy(times) {
            return Math.min(100 + times * 100, 2000);
          },
        });

        cluster.on('error', (error) => {
          logger.warn(`Redis Cluster error: ${error.message}`);
        });

        return cluster;
      },
    },
    RedisService,
    RedisClusterService,
  ],
  exports: [RedisService, RedisClusterService],
})
export class RedisModule {}
