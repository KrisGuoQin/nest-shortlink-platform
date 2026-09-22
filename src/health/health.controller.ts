import { Controller, Get } from '@nestjs/common';

import { Public } from '../common/decorators/public.decorator.js';

import { PrismaService } from '../prisma/prisma.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) { }

  @Get('live')
  @Public()
  live() {
    return {
      status: 'ok',
      instance: process.env.APP_INSTANCE_ID ?? process.env.HOSTNAME ?? 'local',
    };
  }

  @Get('ready')
  @Public()
  async ready() {
    await this.prisma.$queryRaw`
        SELECT 1
      `;

    return {
      status: 'ready',
      instance: process.env.APP_INSTANCE_ID ?? process.env.HOSTNAME ?? 'local',
    };
  }
}
