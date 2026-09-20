import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service.js';
import { PrismaService } from './prisma/prisma.service.js';
import { Public } from './common/decorators/public.decorator.js';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly prisma: PrismaService
  ) {}

  @Get()
  @Public()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('/health')
  @Public()
  async health() {
    await this.prisma.$queryRaw`
      SELECT 1
    `
    return {
      status: 'ok',
      database: 'up',
      timestamp: new Date().toISOString()
    }
  }
}
