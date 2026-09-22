import { Injectable, NestMiddleware } from "@nestjs/common";
import { trace } from "@opentelemetry/api";
import type { Request, Response, NextFunction } from 'express'

@Injectable()
export class TraceIdMiddleware implements NestMiddleware {
    use(req: Request, res: Response, next: NextFunction) {
        if (req.originalUrl === "/metrics") {
            console.log("Skipping trace for /metrics endpoint");
            next();
            return;
        }

        const span = trace.getActiveSpan();
        if (span) {
            const traceId = span.spanContext().traceId;
            console.log(`Trace ID: ${traceId}`);
            res.setHeader('X-Trace-Id', traceId);
        }

        next();
    }
}