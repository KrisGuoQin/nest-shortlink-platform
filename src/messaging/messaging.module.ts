import { Module } from "@nestjs/common";
import { ClientsModule, Transport, } from '@nestjs/microservices'
import { VISIT_EVENTS_CLIENT, VISIT_EVENTS_QUEUE } from "./messaging.constants.js";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { VisitEventPublisher } from "./visit-event.publisher.js";

@Module({
    imports: [
        ClientsModule.registerAsync([
            {
                name: VISIT_EVENTS_CLIENT,
                imports: [ConfigModule],
                inject: [ConfigService],
                useFactory: (config: ConfigService) => ({
                    transport: Transport.RMQ,
                    options: {
                        urls: [config.getOrThrow<string>('RABBITMQ_URL')],
                        queue: VISIT_EVENTS_QUEUE,
                        // 用于让broker重启后的消息持久性更强
                        queueOptions: {
                            durable: true,
                        },
                        persistent: true
                    }
                })
            }
        ])
    ],
    providers: [VisitEventPublisher],
    exports: [VisitEventPublisher]
})
export class MessagingModule { }