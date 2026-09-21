import {
  Controller,
  Get,
  Header,
  HttpStatus,
  Param,
  Redirect,
} from '@nestjs/common';

import { Public } from '../common/decorators/public.decorator.js';

import { ShortCodePipe } from './pipes/short-code.pipe.js';

import { RedirectsService } from './redirects.service.js';

@Controller('r')
export class RedirectsController {
  constructor(private readonly redirectsService: RedirectsService) { }

  @Get(':code')
  @Public()
  @Header('Cache-Control', 'no-store')
  @Redirect()
  async redirect(
    @Param('code', ShortCodePipe)
    code: string,
  ) {
    const url = await this.redirectsService.resolve(code);

    return {
      url,
      statusCode: HttpStatus.FOUND,
    };
  }
}
