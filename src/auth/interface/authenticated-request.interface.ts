import type { Request } from 'express'
import { AccessTokenPayload, JwtPayload } from './jwt-payload.interface.js'

export interface AuthenticatedRequest extends Request {
    user: AccessTokenPayload
}