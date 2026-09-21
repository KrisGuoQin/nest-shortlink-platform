import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RateLimitService } from '../rate-limit.service.js';
import { Observable } from 'rxjs';
import { RateLimitConfog, RateLimitResult } from '../rate-limit.types.js';
import { RATE_LIMIT_KEY } from '../decorators/rate-limit.decorators.js';
import type { Request, Response } from 'express';
import { AccessTokenPayload } from '../../auth/interface/jwt-payload.interface.js';

interface RateLimitRequest extends Request {
    user?: AccessTokenPayload;
}

@Injectable()
export class RateLimitGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly rateLimit: RateLimitService,
    ) { }

    async canActivate(context: ExecutionContext) {
        // 1.先拿到装饰器的值
        const config = this.reflector.getAllAndOverride<RateLimitConfog>(
            RATE_LIMIT_KEY,
            [context.getHandler(), context.getClass()],
        );
        if (!config) {
            return true;
        }

        const http = context.switchToHttp();
        const request = http.getRequest<RateLimitRequest>();
        const response = http.getResponse<Response>();
        const identity = this.resolveIdentity(request, config);
        const key = `rate:${config.prefix}:${identity}`

        let result: RateLimitResult;
        try {
            result = await this.consume(key, config)
        } catch (error) {
            if (config.failureMode === 'closed') {
                throw new HttpException(
                    'Rate limit service unavailable',
                    HttpStatus.SERVICE_UNAVAILABLE
                )
            }

            return true
        }

        this.setHeaders(response, config, result)

        if (!result.allowed) {
            throw new HttpException(
                'Rate limit exceeded',
                HttpStatus
                    .TOO_MANY_REQUESTS,
            );
        }
        return true
    }

    private consume(key: string, config: RateLimitConfog) {
        switch (config.algorithm) {
            case 'fixed':
                return this.rateLimit.fixedWindow(key, config);
            case 'sliding':
                return this.rateLimit.slidingWindow(key, config);
            case 'token-bucket':
                return this.rateLimit.tokenBucket(key, config);
        }
    }

    private resolveIdentity(request: RateLimitRequest, config: RateLimitConfog) {
        switch (config.keyType) {
            case 'ip':
                console.log('ip: ', request.ip)
                return request.ip ?? 'unknown';
            case 'user':
                return request.user?.sub ?? 'anonymous';
            case 'workspace':
                return request.params.workspaceId ?? 'unknown';
            case 'code':
                return request.params.code ?? 'unknown';
        }
    }

    private setHeaders(
        response: Response,
        config: RateLimitConfog,
        result: {
            remaining: number;
            retryAfterMs: number;
        },
    ) {
        response.setHeader(
            'X-RateLimit-Remaining',
            String(Math.max(0, result.remaining)),
        );

        if ('limit' in config) {
            response.setHeader('X-RateLimit-Limit', String(config.limit));
        } else {
            response.setHeader('X-RateLimit-Limit', String(config.capacity));
        }

        if (result.retryAfterMs > 0) {
            response.setHeader(
                'Retry-After',
                String(Math.ceil(result.retryAfterMs / 1000)),
            );
        }
    }
}
