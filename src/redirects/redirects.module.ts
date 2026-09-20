import { Module } from '@nestjs/common';
import { RedirectsService } from './redirects.service.js';
import { RedirectsController } from './redirects.controller.js';
import { ShortCodePipe } from './pipes/short-code.pipe.js';

@Module({
  controllers: [RedirectsController],
  providers: [RedirectsService, ShortCodePipe],
})
export class RedirectsModule { }
