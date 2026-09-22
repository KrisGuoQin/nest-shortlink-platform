import { Module } from '@nestjs/common';
import { RedirectsService } from './redirects.service.js';
import { RedirectsController } from './redirects.controller.js';
import { ShortCodePipe } from './pipes/short-code.pipe.js';
import { JwtModule } from '@nestjs/jwt';
import { ShareAccessTokenService } from './share-access-token.service.js';
import { AuthorizationModule } from '../authorization/authorization.module.js';
import { MessagingModule } from '../messaging/messaging.module.js';
import { MetricsModule } from '../metrics/metrics.module.js';

@Module({
  imports: [
    JwtModule.register({}),
    AuthorizationModule,
    MessagingModule,
    MetricsModule,
  ],
  controllers: [RedirectsController],
  providers: [RedirectsService, ShortCodePipe, ShareAccessTokenService],
})
export class RedirectsModule { }
