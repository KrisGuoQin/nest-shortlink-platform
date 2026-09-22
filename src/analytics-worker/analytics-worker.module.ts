import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module.js';
import { VisitEventsConsumer } from './visit-events.consumer.js';
import { MetricsModule } from '../metrics/metrics.module.js';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
        }),
        PrismaModule,
        MetricsModule,
    ],
    controllers: [VisitEventsConsumer],
})
export class AnalyticsWorkerModule { }
