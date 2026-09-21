import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ConfirmPublisherService } from './confirm-publisher.service.js';
import { OutboxRelayService } from './outbox-relay.service.js';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
        }),
        PrismaModule,
    ],
    providers: [
        ConfirmPublisherService,
        OutboxRelayService
    ]
})
export class OutboxWorkerModule { }
