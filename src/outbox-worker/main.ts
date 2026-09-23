import 'dotenv/config';

import { NestFactory } from '@nestjs/core';

import { OutboxRelayService } from './outbox-relay.service.js';

import { OutboxWorkerModule } from './outbox-worker.module.js';
import { MetricsService } from '../metrics/metrics.service.js';
import { startMetricsHttpServer } from '../metrics/metrics-http-server.js';

process.env.METRICS_SERVICE_NAME = 'outbox-worker';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(OutboxWorkerModule);

  app.enableShutdownHooks();

  const relay = app.get(OutboxRelayService);
  const metrics = app.get(MetricsService);

  const shutdown = async () => {
    relay.stop();

    await app.close();
  };

  process.on('SIGINT', shutdown);

  process.on('SIGTERM', shutdown);

  void relay.run().catch((error) => {
    console.error(error);

    process.exitCode = 1;
  });

  startMetricsHttpServer(metrics, 9466);
  console.log('Outbox worker is running');
}

void bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
