import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { MetricsService } from "../metrics/metrics.service.js";
import { Gauge } from "@prometheus-io/client";

@Injectable()
export class OutboxMetricsService {
    constructor(
        metrics: MetricsService,
        prisma: PrismaService,
    ) {
        new Gauge({
            name: 'shortlink_outbox_events',
            help: 'Current outbox event count by status',
            labelNames: ['status'] as const,
            registers: [metrics.registry],
            async collect() {
                const rows = await prisma.outboxEvent.groupBy({
                    by: ['status'],
                    _count: {
                        _all: true,
                    }
                })
                this.reset();
                for (const row of rows) {
                    this.set({ status: row.status }, row._count._all);
                }
            }
        });
    }
}