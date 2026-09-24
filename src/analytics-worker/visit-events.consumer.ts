import { Controller, Inject, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import {
  context as otelContext,
  propagation,
  ROOT_CONTEXT,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api';

import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ShortLinkVisitedEventV1 } from '../messaging/events/short-link-visited.event.js';
import { SHORT_LINK_VISITED_PATTERN } from '../messaging/messaging.constants.js';
import { MetricsService } from '../metrics/metrics.service.js';

@Controller()
export class VisitEventsConsumer {
  private readonly logger = new Logger(VisitEventsConsumer.name);
  private readonly tracer = trace.getTracer('analytics-worker');

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
  ) {}

  @EventPattern(SHORT_LINK_VISITED_PATTERN)
  async handleVisited(
    @Payload()
    event: ShortLinkVisitedEventV1,
    @Ctx()
    context: unknown,
  ) {
    const parentContext = propagation.extract(
      ROOT_CONTEXT,
      event.traceContext || {},
    );

    return otelContext.with(parentContext, () =>
      this.tracer.startActiveSpan(
        'analytics.consume.shortlink.visited',
        async (span) => {
          try {
            span.setAttribute('message.eventId', event.eventId);
            span.setAttribute('shortlink.id', event.shortLinkId);

            await this.processEvent(event, context);

            span.setStatus({ code: SpanStatusCode.OK });
          } catch (error) {
            span.recordException(
              error instanceof Error ? error : new Error(String(error)),
            );

            span.setStatus({
              code: SpanStatusCode.ERROR,
            });
          } finally {
            span.end();
          }
        },
      ),
    );
  }

  private async processEvent(event: ShortLinkVisitedEventV1, context: unknown) {
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

        if (!event.databaseVisitCountIncremented) {
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
        }
      });

      if (process.env.SIMULATE_CRASH_AFTER_COMMIT === 'true') {
        process.exit(1);
      }

      this.metrics.analyticsEventsTotal.inc({ result: 'processed' });

      channel.ack(message);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        this.logger.warn(`Duplicate event ignored: ${event.eventId}`);

        channel.ack(message);
        this.metrics.analyticsEventsTotal.inc({ result: 'duplicate' });

        return;
      }

      this.logger.error(`Failed event: ${event.eventId}`, error);

      channel.nack(message, false, true);
      this.metrics.analyticsEventsTotal.inc({ result: 'requeued' });
    }
  }
}
