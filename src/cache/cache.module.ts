import { Global, Module } from '@nestjs/common';
import { RedirectCacheService } from './redirect-cache.service.js';
import { MetricsModule } from '../metrics/metrics.module.js';
import { HotCacheService } from './hot-cache.service.js';
import { ShortLinkBloomService } from './short-link-bloom.service.js';
import { ShortLinkResolveCacheService } from './short-link-resolve-cache.service.js';
import { ShortLinkBloomBootstrapService } from './short-link-bloom-bootstrap.service.js';
import { CacheCircuitBreakerService } from './cache-circuit-breaker.service.js';

@Global()
@Module({
  imports: [MetricsModule],
  providers: [
    RedirectCacheService,
    HotCacheService,
    ShortLinkBloomService,
    ShortLinkResolveCacheService,
    ShortLinkBloomBootstrapService,
    CacheCircuitBreakerService,
  ],
  exports: [
    RedirectCacheService,
    HotCacheService,
    ShortLinkBloomService,
    ShortLinkResolveCacheService,
    CacheCircuitBreakerService,
  ],
})
export class CacheModule {}
