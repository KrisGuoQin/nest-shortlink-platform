import { Injectable, NestMiddleware } from "@nestjs/common";
import { MetricsService } from "./metrics.service.js";
import type { Request, Response, NextFunction } from "express";

@Injectable()
export class HttpMetricsMiddleware implements NestMiddleware {
    constructor(private readonly metricsService: MetricsService) { }
    use(req: Request, res: Response, next: NextFunction): void {
        if (req.path === "/metrics") {
            next();
            return;
        }
        const startedAt = process.hrtime.bigint();

        res.on("finish", () => {
            const durationInSeconds = Number(process.hrtime.bigint() - startedAt) / 1e9;
            const route = req.route?.path || req.path;
            const labels = {
                method: req.method,
                route: String(route),
                status_code: res.statusCode.toString(),
            }
            // console.log('[Metrics] HTTP request', labels, `duration: ${durationInSeconds.toFixed(3)}s`);

            this.metricsService.httpRequests.inc(labels);
            this.metricsService.httpDuration.observe(labels, durationInSeconds);
        });

        next();
    }
}