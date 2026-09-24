import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  Redirect,
  Req,
  Res,
  Headers,
} from '@nestjs/common';
import { context as otelContext, propagation } from '@opentelemetry/api';

import { ShortCodePipe } from './pipes/short-code.pipe.js';
import { RedirectsService } from './redirects.service.js';
import { OptionalAuth } from '../common/decorators/optional-auth.decorator.js';
import { getShareCookieName } from './share-access-token.service.js';
import type { OptionalAuthenticatedRequest } from '../auth/interface/optional-authenticated-request.interface.js';
import { Public } from '../common/decorators/public.decorator.js';
import { UnlockShortLinkDto } from './dto/unlock-short-link.dto.js';
import type { Response } from 'express';
import { RateLimit } from '../rate-limit/decorators/rate-limit.decorators.js';
import { VisitEventPublisher } from '../messaging/visit-event.publisher.js';
import { ConfigService } from '@nestjs/config';
import { ShortLinkVisitedEventV1 } from '../messaging/events/short-link-visited.event.js';
import { randomUUID } from 'node:crypto';
import { hashIp } from './hash-ip.js';
import { MetricsService } from '../metrics/metrics.service.js';

@Controller('r')
export class RedirectsController {
  private readonly logger = new Logger(RedirectsController.name);

  constructor(
    private readonly redirectsService: RedirectsService,
    private readonly visitEventPublisher: VisitEventPublisher,
    private readonly config: ConfigService,
    private readonly metrics: MetricsService,
  ) {}

  @Get(':code')
  @OptionalAuth()
  @Header('Cache-Control', 'no-store')
  @RateLimit({
    algorithm: 'token-bucket',
    prefix: 'redirect',
    keyType: 'code',
    capacity: 5,
    refillPerSecond: 1,
    failureMode: 'open',
  })
  @Redirect()
  async redirect(
    @Param('code', ShortCodePipe) code: string,
    @Req() request: OptionalAuthenticatedRequest,
  ) {
    const visibility = await this.redirectsService.getVisibility(code);
    if (visibility !== 'PUBLIC' && !request.user) {
      const frontendBaseUrl = this.config.get<string>(
        'FRONTEND_BASE_URL',
        'http://localhost:5173',
      );
      const accessPage =
        visibility === 'PASSWORD'
          ? new URL(
              `/access/password/${encodeURIComponent(code)}`,
              frontendBaseUrl,
            )
          : new URL('/access/login', frontendBaseUrl);
      if (visibility !== 'PASSWORD') {
        accessPage.searchParams.set('code', code);
      }
      return { url: accessPage.toString(), statusCode: HttpStatus.FOUND };
    }

    const cookieName = getShareCookieName(code);
    const shareToken = request.cookies?.[cookieName];
    const ip = request.ip || request.socket.remoteAddress || '';
    const target = await this.redirectsService.resolve(
      code,
      request.user?.sub,
      shareToken,
    );
    this.publishVisit(code, target, request, ip);

    return {
      url: target.originalUrl,
      statusCode: HttpStatus.FOUND,
    };
  }

  @Post(':code/access')
  @OptionalAuth()
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  async resolveAccess(
    @Param('code', ShortCodePipe) code: string,
    @Req() request: OptionalAuthenticatedRequest,
    @Headers('x-share-access-token') shareAccessToken?: string,
  ) {
    const cookieName = getShareCookieName(code);
    const shareToken = shareAccessToken || request.cookies?.[cookieName];
    const target = await this.redirectsService.resolve(
      code,
      request.user?.sub,
      shareToken,
    );
    const ip = request.ip || request.socket.remoteAddress || '';
    this.publishVisit(code, target, request, ip);
    return { url: target.originalUrl };
  }

  private publishVisit(
    code: string,
    target: Awaited<ReturnType<RedirectsService['resolve']>>,
    request: OptionalAuthenticatedRequest,
    ip: string,
  ) {
    const secret = this.config.getOrThrow<string>('ANALYTICS_IP_HASH_SECRET');

    // traceContext 是一个可选的字段，用于传递 trace context 信息，
    // 以便在事件处理链中进行追踪和关联。它是一个键值对对象，通常包含 traceId、spanId 等信息。
    const traceContext: Record<string, string> = {};
    propagation.inject(otelContext.active(), traceContext);
    const event: ShortLinkVisitedEventV1 = {
      eventId: randomUUID(),
      shortLinkId: target.shortLinkId,
      workspaceId: target.workspaceId,
      shortCode: target.code,
      occurredAt: new Date().toISOString(),
      databaseVisitCountIncremented: target.databaseVisitCountIncremented,
      ipHash: ip ? hashIp(ip, secret) : undefined,
      userAgent: request.get('user-agent')?.slice(0, 512),
      referer: request.get('referer')?.slice(0, 2048),
      traceContext,
    };

    void this.visitEventPublisher
      .publish(event)
      .then(() => {
        this.metrics.visitEventPublishTotal.inc({ result: 'success' });
      })
      .catch((error) => {
        this.metrics.visitEventPublishTotal.inc({ result: 'failed' });
        this.logger.error(
          `Failed to publish visit event for short link ${code}: ${error.message}`,
          error.stack,
        );
      });
  }

  @Post(':code/unlock')
  @Public()
  @HttpCode(HttpStatus.OK)
  async unlock(
    @Param('code', ShortCodePipe) code: string,
    @Body() dto: UnlockShortLinkDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.redirectsService.unlock(code, dto.password);
    response.cookie(getShareCookieName(code), result.token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: result.expiresIn * 1000,
      path: `/r/${code}`,
    });

    return {
      unlock: true,
      token: result.token,
      expiresIn: result.expiresIn,
    };
  }
}
