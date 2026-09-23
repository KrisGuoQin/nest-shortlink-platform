import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { ShortLinkBloomService } from './short-link-bloom.service.js';

@Injectable()
export class ShortLinkBloomBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ShortLinkBloomBootstrapService.name);
  private readonly batchSize = 500;

  constructor(
    private readonly prisma: PrismaService,
    private readonly bloom: ShortLinkBloomService,
  ) {}

  async onApplicationBootstrap() {
    this.bloom.markNotReady();

    try {
      this.logger.log('Initializing short-link Bloom Filter');

      await this.bloom.initializeBuckets();

      let cursor: string | undefined;
      let loadedCount = 0;

      while (true) {
        const links = await this.prisma.shortLink.findMany({
          take: this.batchSize,
          ...(cursor
            ? {
                cursor: { id: cursor },
                skip: 1,
              }
            : {}),
          orderBy: { id: 'asc' },
          select: {
            id: true,
            code: true,
          },
        });

        if (links.length === 0) {
          break;
        }

        await this.bloom.addMany(links.map((link) => link.code));

        loadedCount += links.length;
        cursor = links[links.length - 1].id;

        this.logger.log(`Bloom bootstrap progress: ${loadedCount}`);

        if (links.length < this.batchSize) {
          break;
        }
      }

      this.bloom.markReady();
      this.logger.log(
        `Bloom bootstrap completed: ${loadedCount} short links loaded`,
      );
    } catch (error) {
      this.bloom.markNotReady();

      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;

      this.logger.error(`Bloom bootstrap failed: ${message}`, stack);
    }
  }
}
