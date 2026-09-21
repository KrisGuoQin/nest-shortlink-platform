export type RateLimitKeyType = 'ip' | 'user' | 'workspace' | 'code'

// redis挂了后的行为，高敏感操作使用close，防止被攻击者暴力破解
// 高可用流量使用open，可以继续redirect，否则限流系统挂了，就相当于整个平台挂了
export type RateLimitFailureMode = 'open' | 'closed'

// 固定窗口
export interface FixedWindowConfig {
    algorithm: 'fixed';
    prefix: string;
    keyType: RateLimitKeyType;
    limit: number;
    windowSeconds: number;
    failureMode?: RateLimitFailureMode;
}

// 滑动窗口
export interface SlidingWindowConfig {
    algorithm: 'sliding';
    prefix: string;
    keyType: RateLimitKeyType;
    limit: number;
    windowSeconds: number;
    failureMode?: RateLimitFailureMode;
}

// token bucket
export interface TokenBucketConfig {
    algorithm: 'token-bucket';
    prefix: string;
    keyType: RateLimitKeyType;
    capacity: number;
    refillPerSecond: number;
    failureMode?: RateLimitFailureMode;
}

export type RateLimitConfog = FixedWindowConfig | SlidingWindowConfig | TokenBucketConfig

export interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    retryAfterMs: number;
}