export interface AuditEventEnvelope {
    eventId: string;
    eventType: string;
    occurredAt: string;
    workspaceId: string;
    actorUserId: string;
    requestId: string;
    action: string;
    resource: {
        type: string;
        id?: string;
    };
    data: Record<string, unknown>;
}