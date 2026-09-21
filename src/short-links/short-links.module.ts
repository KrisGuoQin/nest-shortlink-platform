import { Module } from '@nestjs/common';
import { ShortLinksService } from './short-links.service.js';
import { ShortLinksController } from './short-links.controller.js';
import { ShortLinkSharingController } from './short-link-sharing.controller.js';
import { ShortLinkSharingService } from './short-link-sharing.service.js';
import { AuditOutboxService } from '../audit/audit-outbox.service.js';

@Module({
  controllers: [ShortLinksController, ShortLinkSharingController],
  providers: [ShortLinksService, ShortLinkSharingService, AuditOutboxService],
  exports: [ShortLinksService]
})
export class ShortLinksModule { }
