// 事件名称一定要带版本，应对未来演进
export interface ShortLinkVisitedEventV1 {
    eventId: string;
    shortLinkId: string;
    workspaceId: string;
    shortCode: string;
    occurredAt: string;
    ipHash?: string;
    userAgent?: string;
    referer?: string;

    traceContext?: Record<string, string>; // 可选的 trace context 信息
}