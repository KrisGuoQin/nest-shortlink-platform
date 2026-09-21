import {
    createHmac,
} from 'node:crypto';

export function hashIp(
    ip: string,
    secret: string,
) {
    return createHmac(
        'sha256',
        secret,
    )
        .update(ip)
        .digest('hex');
}