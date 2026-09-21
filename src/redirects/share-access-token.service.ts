import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

export interface ShareAccessPayload {
    type: 'share_access';
    linkId: string;
    code: string;
    ver: number;
    iat?: number;
    exp?: number;
}
const SHARE_TOKEN_TTL = 30 * 60;

@Injectable()
export class ShareAccessTokenService {
    constructor(
        private readonly jwt: JwtService,
        private readonly config: ConfigService,
    ) { }

    async sign(linkId: string, code: string, ver: number) {
        return await this.jwt.signAsync(
            {
                type: 'share_access',
                linkId,
                code,
                ver,
            } satisfies ShareAccessPayload,
            {
                secret: this.config.getOrThrow<string>('SHARE_ACCESS_SECRET'),
                expiresIn: SHARE_TOKEN_TTL,
            },
        );
    }

    async verify(token: string) {
        const payload = await this.jwt.verifyAsync<ShareAccessPayload>(token, {
            secret: this.config.getOrThrow<string>('SHARE_ACCESS_SECRET'),
        });

        if (payload.type !== 'share_access') {
            throw new Error('Invalid token type');
        }

        return payload;
    }

    getExpiresIn() {
        return SHARE_TOKEN_TTL;
    }
}

export function getShareCookieName(code: string) {
    return `sl_share_${code}`;
}
