import type { Request } from 'express';

import type { AccessTokenPayload } from './jwt-payload.interface.js';

export interface OptionalAuthenticatedRequest extends Request {
    user?: AccessTokenPayload;
}
