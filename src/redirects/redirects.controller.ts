import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
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

@Controller('r')
export class RedirectsController {
  constructor(private readonly redirectsService: RedirectsService) { }

  @Get(':code')
  @OptionalAuth()
  @Header('Cache-Control', 'no-store')
  @RateLimit({
    algorithm: 'token-bucket',
    prefix: 'redirect',
    keyType: 'code',
    capacity: 5,
    refillPerSecond: 1,
    failureMode: 'open'
  })
  @Redirect()
  async redirect(
    @Param('code', ShortCodePipe) code: string,
    @Req() request: OptionalAuthenticatedRequest
  ) {
    const cookieName = getShareCookieName(code)
    const shareToken = request.cookies?.[cookieName]
    const url = await this.redirectsService.resolve(
      code,
      request.user?.sub,
      shareToken
    );

    return {
      url,
      statusCode: HttpStatus.FOUND,
    };
  }

  @Post(':code/unlock')
  @Public()
  @HttpCode(HttpStatus.OK)
  async unlock(
    @Param('code', ShortCodePipe) code: string,
    @Body() dto: UnlockShortLinkDto,
    @Res({ passthrough: true }) response: Response
  ) {
    const result = await this.redirectsService.unlock(code, dto.password)
    response.cookie(
      getShareCookieName(code),
      result.token,
      {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: result.expiresIn * 1000,
        path: `/r/${code}`
      }
    )

    return {
      unlock: true,
      expiresIn: result.expiresIn
    }
  }

}
