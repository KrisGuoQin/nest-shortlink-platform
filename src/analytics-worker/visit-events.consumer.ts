import { Controller, Inject, Logger } from '@nestjs/common';

import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';

import { Prisma } from '../generated/prisma/client.js';

import { PrismaService } from '../prisma/prisma.service.js';

import type { ShortLinkVisitedEventV1 } from '../messaging/events/short-link-visited.event.js';

import { SHORT_LINK_VISITED_PATTERN } from '../messaging/messaging.constants.js';

@Controller()
export class VisitEventsConsumer {
    private readonly logger = new Logger(VisitEventsConsumer.name);

    constructor(private readonly prisma: PrismaService) { }

    @EventPattern(SHORT_LINK_VISITED_PATTERN)
    async handleVisited(
        @Payload()
        event: ShortLinkVisitedEventV1,
        @Ctx()
        context: unknown,
    ) {
        const rmqContext = context as RmqContext;
        const channel = rmqContext.getChannelRef();
        const message = rmqContext.getMessage();

        try {
            await this.prisma.$transaction(async (tx) => {
                await tx.shortLinkVisit.create({
                    data: {
                        eventId: event.eventId,
                        shortLinkId: event.shortLinkId,
                        workspaceId: event.workspaceId,
                        shortCode: event.shortCode,
                        visitedAt: new Date(event.occurredAt),
                        ipHash: event.ipHash,
                        userAgent: event.userAgent,
                        referer: event.referer,
                    },
                });

                await tx.shortLink.updateMany({
                    where: {
                        id: event.shortLinkId,
                    },
                    data: {
                        visitCount: {
                            increment: 1,
                        },
                    },
                });
            });

            if (process.env.SIMULATE_CRASH_AFTER_COMMIT === 'true') {
                process.exit(1);
            }

            channel.ack(message);
        } catch (error) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2002'
            ) {
                this.logger.warn(`Duplicate event ignored: ${event.eventId}`);

                channel.ack(message);

                return;
            }

            this.logger.error(`Failed event: ${event.eventId}`, error);

            channel.nack(message, false, true);
        }
    }
}
