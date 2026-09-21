import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from 'redis';

type RedisClient = ReturnType<typeof createClient>

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(RedisService.name)
    readonly client: RedisClient;

    constructor(private readonly config: ConfigService) {
        const url = this.config.getOrThrow<string>("REDIS_URL")
        this.client = createClient({
            url
        })
        this.client.on('error', error => {
            this.logger.error('Redis error', error)
        })
    }

    async onModuleInit() {
        if (!this.client.isOpen) {
            this.client.connect()
        }
        this.logger.log('Redis connected')
    }

    async onModuleDestroy() {
        if (this.client.isOpen) {
            this.client.quit()
        }
    }
}
