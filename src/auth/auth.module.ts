import { Module } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { UsersModule } from '../users/users.module.js';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from './guard/jwt-auth.guard.js';
import { AuthTokenService } from './auth-token.service.js';

@Module({
  imports: [
    UsersModule,
    ConfigModule,
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, AuthTokenService],
  exports: [JwtAuthGuard, AuthTokenService]
})
export class AuthModule {}
