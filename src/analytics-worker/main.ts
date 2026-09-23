import 'dotenv/config';

import { NestFactory } from '@nestjs/core';

import { MicroserviceOptions, Transport } from '@nestjs/microservices';

import { AnalyticsWorkerModule } from './analytics-worker.module.js';

import { VISIT_EVENTS_QUEUE } from '../messaging/messaging.constants.js';
import { MetricsService } from '../metrics/metrics.service.js';
import { startMetricsHttpServer } from '../metrics/metrics-http-server.js';

process.env.METRICS_SERVICE_NAME = 'analytics-worker';

async function bootstrap() {
  const rabbitmqUrl = process.env.RABBITMQ_URL;

  if (!rabbitmqUrl) {
    throw new Error('RABBITMQ_URL is not defined');
  }

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AnalyticsWorkerModule,
    {
      transport: Transport.RMQ,
      options: {
        urls: [rabbitmqUrl],
        queue: VISIT_EVENTS_QUEUE,
        queueOptions: {
          durable: true,
        },
        // 开启手动ack
        noAck: false,
        // 限制消费者预取，尚未确认的消息数量
        prefetchCount: 50,
      },
    },
  );

  // 给analytics worker启动一个http server，用于prometheus抓取指标
  const metrics = app.get(MetricsService);
  startMetricsHttpServer(metrics, 9465);

  await app.listen();
  console.log('Analytics worker is listening for visit events...');
}

void bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
