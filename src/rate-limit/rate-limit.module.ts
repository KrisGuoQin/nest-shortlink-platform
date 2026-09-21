import { Module } from '@nestjs/common';
import { RateLimitService } from './rate-limit.service.js';
import { RateLimitGuard } from './guards/rate-limit.guard.js';

@Module({
  providers: [RateLimitService, RateLimitGuard],
  exports: [RateLimitService, RateLimitGuard],
})
export class RateLimitModule { }
