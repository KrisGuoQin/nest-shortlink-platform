import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { randomUUID } from 'node:crypto';

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
