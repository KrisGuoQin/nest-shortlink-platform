import { Controller, Get, Header } from '@nestjs/common';
import { MetricsService } from './metrics.service.js';
import { Public } from '../common/decorators/public.decorator.js';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) { }

  @Get()
  @Public()
  @Header('Content-Type', 'text/plain')
  async getMetrics() {
    return this.metricsService.render();
  }
}
