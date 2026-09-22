import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { monitorEventLoopDelay, performance } from 'node:perf_hooks';

@Injectable()
export class PerfService implements OnModuleInit, OnModuleDestroy {
    private readonly eventLoopDelay = monitorEventLoopDelay({
        resolution: 10,
    });

    private previousElu = performance.eventLoopUtilization();

    onModuleInit() {
        this.eventLoopDelay.enable();
    }

    onModuleDestroy() {
        this.eventLoopDelay.disable();
    }

    snapshot() {
        const elu = performance.eventLoopUtilization(this.previousElu);

        this.previousElu = performance.eventLoopUtilization();

        const memory = process.memoryUsage();

        const nsToMs = (value: number) => value / 1_000_000;

        const result = {
            timestamp: new Date().toISOString(),

            uptimeSeconds: process.uptime(),

            eventLoop: {
                utilization: Number(elu.utilization.toFixed(4)),

                utilizationPercent: Number((elu.utilization * 100).toFixed(2)),

                delayMs: {
                    mean: Number(nsToMs(this.eventLoopDelay.mean).toFixed(2)),

                    p50: Number(nsToMs(this.eventLoopDelay.percentile(50)).toFixed(2)),

                    p95: Number(nsToMs(this.eventLoopDelay.percentile(95)).toFixed(2)),

                    p99: Number(nsToMs(this.eventLoopDelay.percentile(99)).toFixed(2)),

                    max: Number(nsToMs(this.eventLoopDelay.max).toFixed(2)),
                },
            },

            memoryMb: {
                rss: Number((memory.rss / 1024 / 1024).toFixed(2)),

                heapUsed: Number((memory.heapUsed / 1024 / 1024).toFixed(2)),

                heapTotal: Number((memory.heapTotal / 1024 / 1024).toFixed(2)),

                external: Number((memory.external / 1024 / 1024).toFixed(2)),
            },
        };

        this.eventLoopDelay.reset();

        return result;
    }
}
