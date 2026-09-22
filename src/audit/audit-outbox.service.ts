import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { randomUUID } from 'node:crypto';
import { context as otelContext, propagation } from '@opentelemetry/api'

interface RecordAuditInput {
    eventType: string;
    workspaceId?: string;
    actorUserId?: string;
    requestId?: string;
    action: string;
    resourceType: string;
    resourceId?: string;
    data?: Prisma.InputJsonObject;
}

@Injectable()
export class AuditOutboxService {
    async record(tx: Prisma.TransactionClient, input: RecordAuditInput) {
        const traceContext: Record<string, string> = {};
        propagation.inject(otelContext.active(), traceContext);

        const eventId = randomUUID();
        const occurredAt = new Date();
        const payload: Prisma.InputJsonValue = {
            eventId,
            eventType: input.eventType,
            occurredAt: occurredAt.toISOString(),
            workspaceId: input.workspaceId ?? null,
            actorUserId: input.actorUserId ?? null,
            requestId: input.requestId ?? null,
            action: input.action,
            data: input.data ?? {},
            resource: {
                type: input.resourceType,
                id: input.resourceId ?? null,
            },
            traceContext, // 将 traceContext 添加到 payload 中，http和outbox连接起来
        };

        await tx.auditLog.create({
            data: {
                eventId,
                workspaceId: input.workspaceId,
                requestId: input.requestId,
                actorUserId: input.actorUserId,
                action: input.action,
                resourceType: input.resourceType,
                resourceId: input.resourceId,
                metadata: input.data || undefined,
                createdAt: occurredAt,
            },
        });
        await tx.outboxEvent.create({
            data: {
                id: eventId,
                eventType: input.eventType,
                aggregateType: input.resourceType,
                aggregateId: input.resourceId,
                payload,
            },
        });

        return {
            eventId,
        };
    }
}
