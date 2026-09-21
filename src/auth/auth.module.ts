import { Module } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { UsersModule } from '../users/users.module.js';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from './guard/jwt-auth.guard.js';
import { AuthTokenService } from './auth-token.service.js';
import { RateLimitModule } from '../rate-limit/rate-limit.module.js';

@Module({
  imports: [
    UsersModule,
    ConfigModule,
    JwtModule.register({}),
    RateLimitModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthTokenService],
  exports: [AuthTokenService]
})
export class AuthModule { }
