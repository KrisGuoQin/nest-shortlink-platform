import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ConfirmPublisherService } from './confirm-publisher.service.js';
import { OutboxRelayService } from './outbox-relay.service.js';
import { MetricsModule } from '../metrics/metrics.module.js';
import { OutboxMetricsService } from './outbox-metrics.service.js';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
        }),
        PrismaModule,
        MetricsModule,
    ],
    providers: [
        ConfirmPublisherService,
        OutboxRelayService,
        OutboxMetricsService,
    ]
})
export class OutboxWorkerModule { }
