import { randomInt } from 'node:crypto';

export const BASE62 =
    '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export function generateShortCode(length = 8) {
    let code = '';

    for (let index = 0; index < length; index++) {
        const randomIndex = randomInt(0, BASE62.length);

        code += BASE62[randomIndex];
    }

    return code;
}
