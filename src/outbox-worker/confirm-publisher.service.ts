import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqp-connection-manager';
import type { Channel } from 'amqp-connection-manager';

type AmqpManager = ReturnType<typeof amqp.connect>;
type ManagedChannel = ReturnType<AmqpManager['createChannel']>;

@Injectable()
export class ConfirmPublisherService implements OnModuleInit, OnModuleDestroy {
    private connection!: AmqpManager;
    private channel!: ManagedChannel;
    private queue!: string;

    constructor(private readonly config: ConfigService) { }

    async onModuleInit() {
        const url = this.config.getOrThrow<string>('RABBITMQ_URL');
        this.queue =
            this.config.get<string>('DOMAIN_EVENTS_QUEUE') ??
            'shortlink.domain-events.v1';
        this.connection = amqp.connect([url]);
        this.channel = this.connection.createChannel({
            confirm: true,
            json: true,
            publishTimeout: 5000,
            setup: async (channel: Channel) => {
                await channel.assertQueue(this.queue, {
                    durable: true,
                });
            },
        });

        await this.connection.connect({ timeout: 5000 });
        await this.channel.waitForConnect();
    }

    async onModuleDestroy() {
        await this.channel?.close();
        await this.connection?.close();
    }

    async publish(eventId: string, eventType: string, payload: unknown) {
        await this.channel.sendToQueue(
            this.queue,
            { pattern: eventType, data: payload },
            {
                persistent: true,
                messageId: eventId,
                type: eventType,
                contentType: 'application/json',
                timeout: 5000,
            },
        );
    }
}
