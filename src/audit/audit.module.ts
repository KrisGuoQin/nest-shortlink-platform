import { Module } from '@nestjs/common';
import { AuditService } from './audit.service.js';
import { AuditController } from './audit.controller.js';
import { AuditOutboxService } from './audit-outbox.service.js';

@Module({
  controllers: [AuditController],
  providers: [AuditService, AuditOutboxService],
  exports: [AuditOutboxService]
})
export class AuditModule { }
