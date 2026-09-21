import { SetMetadata } from "@nestjs/common"
import { RateLimitConfog } from "../rate-limit.types.js"

export const RATE_LIMIT_KEY = 'rate_limit'
export const RateLimit = (config: RateLimitConfog) => SetMetadata(RATE_LIMIT_KEY, config)