import { Injectable, NestMiddleware } from '@nestjs/common';

import type { NextFunction, Request, Response } from 'express';

@Injectable()
export class InstanceIdMiddleware implements NestMiddleware {
    use(request: Request, response: Response, next: NextFunction) {
        response.setHeader(
            'x-instance-id',
            process.env.APP_INSTANCE_ID ?? process.env.HOSTNAME ?? 'local',
        );

        next();
    }
}
