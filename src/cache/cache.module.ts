import { Global, Module } from "@nestjs/common";
import { RedirectCacheService } from "./redirect-cache.service.js";

@Global()
@Module({
    providers: [RedirectCacheService],
    exports: [RedirectCacheService],
})
export class CacheModule { }