import 'dotenv/config';

import { NestFactory } from '@nestjs/core';

import { OutboxRelayService } from './outbox-relay.service.js';

import { OutboxWorkerModule } from './outbox-worker.module.js';

async function bootstrap() {
    const app = await NestFactory.createApplicationContext(OutboxWorkerModule);

    app.enableShutdownHooks();

    const relay = app.get(OutboxRelayService);

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
}

bootstrap();
