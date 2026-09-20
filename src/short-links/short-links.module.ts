import { Module } from '@nestjs/common';
import { ShortLinksService } from './short-links.service.js';
import { ShortLinksController } from './short-links.controller.js';

@Module({
  controllers: [ShortLinksController],
  providers: [ShortLinksService],
  exports: [ShortLinksService]
})
export class ShortLinksModule { }
