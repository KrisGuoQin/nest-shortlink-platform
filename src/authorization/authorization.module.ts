import { Module } from '@nestjs/common';
import { AuthorizationService } from './authorization.service.js';
import { AuthorizationController } from './authorization.controller.js';
import { WorkspacePermissionGuard } from './guards/workspace-permission.guard.js';

@Module({
  controllers: [AuthorizationController],
  providers: [AuthorizationService],
  exports: [AuthorizationService]
})
export class AuthorizationModule {}
