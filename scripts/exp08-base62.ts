import { decodeBase62, encodeBase62 } from '../src/common/utils/base62.js';

const numbers = [
    0n,
    1n,
    61n,
    62n,
    1000n,
    1_000_000n,
    1_000_000_000n,
    9_007_199_254_740_991n,
];

for (const number of numbers) {
    const code = encodeBase62(number);

    const decoded = decodeBase62(code);

    console.log({
        number: number.toString(),

        code,

        decoded: decoded.toString(),

        correct: decoded === number,
    });
}
