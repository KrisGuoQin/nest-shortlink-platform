import { Inject, Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from "@nestjs/common";
import { SHORT_LINK_VISITED_PATTERN, VISIT_EVENTS_CLIENT } from "./messaging.constants.js";
import { ClientProxy } from "@nestjs/microservices";
import { ShortLinkVisitedEventV1 } from "./events/short-link-visited.event.js";
import { lastValueFrom } from "rxjs";

@Injectable()
export class VisitEventPublisher implements OnApplicationBootstrap, OnApplicationShutdown {
    private readonly logger = new Logger(VisitEventPublisher.name)

    constructor(
        @Inject(VISIT_EVENTS_CLIENT)
        private readonly client: ClientProxy
    ) { }

    async onApplicationBootstrap() {
        await this.client.connect()
        this.logger.log('RabbitMQ publisher connected')
    }

    async onApplicationShutdown() {
        await this.client.close()
        this.logger.log('RabbitMQ publisher close')
    }

    async publish(event: ShortLinkVisitedEventV1) {
        await lastValueFrom(this.client.emit(
            SHORT_LINK_VISITED_PATTERN,
            event
        ))
    }
}