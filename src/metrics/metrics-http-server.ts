import { createServer } from "node:http";
import { MetricsService } from "./metrics.service.js";

export function startMetricsHttpServer(metricsService: MetricsService, port: number) {
    const server = createServer(async (req, res) => {
        if (req.method === "GET" && req.url === "/metrics") {
            try {
                const metrics = await metricsService.render();
                res.writeHead(200, { "Content-Type": metricsService.getContentType() });
                res.end(metrics);
            } catch (error) {
                res.writeHead(500, { "Content-Type": "text/plain" });
                res.end("Error generating metrics");
            }
        } else {
            res.writeHead(404, { "Content-Type": "text/plain" });
            res.end("Not Found");
        }
    });
    server.listen(port, '0.0.0.0', () => {
        console.log(`Metrics server listening on port ${port}`);
    });

    return server;
}