import { Injectable, Logger } from '@nestjs/common';
import { OutboxStatus, Prisma } from '../generated/prisma/client.js';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { ConfigService } from '@nestjs/config';
import {
    context as otelContext,
    propagation,
    ROOT_CONTEXT,
    SpanStatusCode,
    trace,
} from '@opentelemetry/api';

import { ConfirmPublisherService } from './confirm-publisher.service.js';
import { MetricsService } from '../metrics/metrics.service.js';

interface ClaimedOutboxEvent {
    id: string;
    eventType: string;
    attempts: number;
    payload: Prisma.JsonValue;
}

@Injectable()
export class OutboxRelayService {
    private readonly logger = new Logger(OutboxRelayService.name);
    private readonly workerId = randomUUID();
    private readonly tracer = trace.getTracer('outbox-worker');
    private stopped = false;

    constructor(
        private readonly prisma: PrismaService,
        private readonly config: ConfigService,
        private readonly publisher: ConfirmPublisherService,
        private readonly metrics: MetricsService,
    ) { }

    async run() {
        const interval = Number(
            this.config.get<number>('OUTBOX_POLL_INTERVAL_MS') ?? 500,
        );
        while (!this.stopped) {
            try {
                const batch = await this.claimBatch();

                if (batch.length === 0) {
                    await this.sleep(interval);
                    continue;
                }

                for (const event of batch) {
                    await this.publishOne(event);
                }
            } catch (error) {
                this.logger.error('Outbox loop failed', error);
                await this.sleep(interval);
            }
        }
    }

    stop() {
        this.stopped = true;
    }

    private async claimBatch() {
        const batchSize = Number(this.config.get('OUTBOX_BATCH_SIZE') ?? 50);
        const leaseMs = Number(this.config.get('OUTBOX_LEASE_MS') ?? 30_000);
        const leaseCutoff = new Date(Date.now() - leaseMs);

        return this.prisma.$transaction(async (tx) => {
            return tx.$queryRaw<ClaimedOutboxEvent[]>`
                WITH picked AS (
                    SELECT id
                    FROM "OutboxEvent"
                    WHERE
                        "nextAttemptAt" <= NOW()
                        AND (
                            status = 'PENDING'::"OutboxStatus"
                            OR (
                                status = 'PROCESSING'::"OutboxStatus"
                                AND "lockedAt" < ${leaseCutoff}
                            )
                        )
                    ORDER BY
                        "createdAt"
                    FOR UPDATE SKIP LOCKED
                    LIMIT ${batchSize}
                )
                UPDATE "OutboxEvent" AS event
                SET
                    status = 'PROCESSING'::"OutboxStatus",
                    "lockedAt" = NOW(),
                    "lockedBy" = ${this.workerId},
                    attempts = event.attempts + 1,
                    "updatedAt" = NOW()
                FROM picked
                WHERE
                    event.id = picked.id
                RETURNING
                    event.id,
                    event."eventType",
                    event.payload,
                    event.attempts;
            `;
        });
    }

    private async publishOne(event: ClaimedOutboxEvent) {
        const storedCarrier = this.getTraceContext(event.payload);
        const parentContext = propagation.extract(ROOT_CONTEXT, storedCarrier);

        return otelContext.with(parentContext, () =>
            this.tracer.startActiveSpan(`outbox.publish`, async (span) => {
                try {
                    span.setAttribute('messaging.event_id', event.id);

                    span.setAttribute('messaging.event_type', event.eventType);
                    const outgoingCarrier: Record<string, string> = {};

                    propagation.inject(otelContext.active(), outgoingCarrier);
                    const outgoingPayload = this.withTraceContext(
                        event.payload,
                        outgoingCarrier,
                    );
                    await this.publisher.publish(
                        event.id,
                        event.eventType,
                        outgoingPayload,
                    );

                    if (process.env.SIMULATE_CRASH_AFTER_PUBLISH === 'true') {
                        process.exit(1);
                    }

                    await this.prisma.outboxEvent.updateMany({
                        where: {
                            id: event.id,
                            status: OutboxStatus.PROCESSING,
                            lockedBy: this.workerId,
                        },
                        data: {
                            status: OutboxStatus.PUBLISHED,
                            publishedAt: new Date(),
                            lockedAt: null,
                            lockedBy: null,
                            lastError: null,
                        },
                    });
                    span.setStatus({ code: SpanStatusCode.OK });
                    this.metrics.outboxPublishTotal.inc({ result: 'published' });
                } catch (error) {
                    span.recordException(
                        error instanceof Error ? error : new Error(String(error)),
                    );

                    span.setStatus({
                        code: SpanStatusCode.ERROR,
                    });
                    await this.handleFailure(event, error);
                } finally {
                    span.end();
                }
            }),
        );
    }

    private async handleFailure(event: ClaimedOutboxEvent, error: unknown) {
        const maxAttempts = this.config.get('OUTBOX_MAX_ATTEMPTS') ?? 10;
        const dead = event.attempts > maxAttempts;
        const delaySeconds = Math.min(300, 2 ** Math.min(event.attempts, 8));
        const message =
            error instanceof Error
                ? (error.stack ?? error.message).slice(0, 4000)
                : String(error).slice(0, 4000);

        await this.prisma.outboxEvent.updateMany({
            where: {
                id: event.id,
                status: OutboxStatus.PROCESSING,
                lockedBy: this.workerId,
            },
            data: {
                status: dead ? OutboxStatus.DEAD : OutboxStatus.PENDING,
                nextAttemptAt: new Date(Date.now() + delaySeconds * 1000),
                lockedAt: null,
                lockedBy: null,
                lastError: message,
            },
        });

        this.metrics.outboxPublishTotal.inc({ result: dead ? 'dead' : 'retry' });
        this.logger.error(
            `Publish failed event=${event.id} attempts=${event.attempts}`,
        );
    }

    private sleep(ms: number) {
        return new Promise<void>((resolve) => setTimeout(resolve, ms));
    }

    private getTraceContext(payload: Prisma.JsonValue) {
        if (
            typeof payload !== 'object' ||
            payload === null ||
            Array.isArray(payload)
        ) {
            return {};
        }
        const value = (payload as Record<string, unknown>)['traceContext'];
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
            return {};
        }
        return value as Record<string, string>;
    }

    private withTraceContext(
        payload: Prisma.JsonValue,

        traceContext: Record<string, string>,
    ): Prisma.InputJsonValue {
        if (
            typeof payload !== 'object' ||
            payload === null ||
            Array.isArray(payload)
        ) {
            return {
                data: payload as Prisma.InputJsonValue,

                traceContext,
            };
        }

        return {
            ...(payload as Record<string, Prisma.JsonValue>),

            traceContext,
        } as Prisma.InputJsonValue;
    }
}
