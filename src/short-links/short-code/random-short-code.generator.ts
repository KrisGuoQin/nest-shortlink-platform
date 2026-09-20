import { randomInt } from 'node:crypto';

import type { ShortCodeGenerator } from './short-code-generator.interface.js';

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export class RandomShortCodeGenerator implements ShortCodeGenerator {
    constructor(private readonly length = 10) { }

    generate() {
        let result = '';

        for (let index = 0; index < this.length; index++) {
            result += BASE62[randomInt(BASE62.length)];
        }

        return result;
    }
}
