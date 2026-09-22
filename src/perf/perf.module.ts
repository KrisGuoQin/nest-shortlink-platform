import { Module } from '@nestjs/common';
import { PerfService } from './perf.service.js';
import { PerfController } from './perf.controller.js';

@Module({
  controllers: [PerfController],
  providers: [PerfService],
})
export class PerfModule {}
