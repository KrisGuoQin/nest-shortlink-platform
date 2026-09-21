import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import type { AuthenticatedRequest } from './interface/authenticated-request.interface.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { Public } from '../common/decorators/public.decorator.js';
import { RateLimit } from '../rate-limit/decorators/rate-limit.decorators.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }


  @Post('register')
  @Public()
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto)
  }

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @RateLimit({ // 滑动窗口60秒内登录10次
    algorithm: 'sliding',
    prefix: 'login-ip',
    keyType: 'ip',
    limit: 10,
    windowSeconds: 60,
    failureMode: 'closed' // 限流系统挂了，不允许继续用，防止暴力破解
  })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto)
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshTokenDto) {
    return await this.authService.refresh(dto.refreshToken)
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() request: AuthenticatedRequest) {
    return this.authService.logout(request.user.sub, request.user.sid)
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logoutAll(@Req() request: AuthenticatedRequest) {
    return this.authService.logoutAll(request.user.sub)
  }

  @Get('me')
  async me(@Req() request: AuthenticatedRequest) {
    return this.authService.me(request.user.sub)
  }
}
