import { Global, Module } from "@nestjs/common";
import { RedirectCacheService } from "./redirect-cache.service.js";
import { MetricsModule } from "../metrics/metrics.module.js";

@Global()
@Module({
    imports: [MetricsModule],
    providers: [RedirectCacheService],
    exports: [RedirectCacheService],
})
export class CacheModule { }