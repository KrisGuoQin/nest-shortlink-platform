import { Controller, Get, NotFoundException } from '@nestjs/common';

import { Public } from '../common/decorators/public.decorator.js';

import { PerfService } from './perf.service.js';

@Controller('internal')
export class PerfController {
  constructor(private readonly perfService: PerfService) { }

  @Get('perf')
  @Public()
  snapshot() {
    if (process.env.PERF_ENDPOINT_ENABLED !== 'true') {
      throw new NotFoundException();
    }

    return this.perfService.snapshot();
  }
}
