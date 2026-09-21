import 'dotenv/config';

import { NestFactory } from '@nestjs/core';

import { MicroserviceOptions, Transport } from '@nestjs/microservices';

import { AnalyticsWorkerModule } from './analytics-worker.module.js';

import { VISIT_EVENTS_QUEUE } from '../messaging/messaging.constants.js';

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

    await app.listen();
}

bootstrap();
