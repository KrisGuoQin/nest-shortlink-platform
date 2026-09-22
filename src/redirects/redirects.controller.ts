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
} from '@nestjs/common';

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
  ) { }

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
    const cookieName = getShareCookieName(code);
    const shareToken = request.cookies?.[cookieName];
    const ip = request.ip || request.socket.remoteAddress || '';
    const target = await this.redirectsService.resolve(
      code,
      request.user?.sub,
      shareToken,
    );
    const secret = this.config.getOrThrow<string>('ANALYTICS_IP_HASH_SECRET');

    const event: ShortLinkVisitedEventV1 = {
      eventId: randomUUID(),
      shortLinkId: target.shortLinkId,
      workspaceId: target.workspaceId,
      shortCode: target.code,
      occurredAt: new Date().toISOString(),
      ipHash: ip ? hashIp(ip, secret) : undefined,
      userAgent: request.get('user-agent')?.slice(0, 512),
      referer: request.get('referer')?.slice(0, 2048),
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

    return {
      url: target.originalUrl,
      statusCode: HttpStatus.FOUND,
    };
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
      expiresIn: result.expiresIn,
    };
  }
}
