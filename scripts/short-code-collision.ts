import {
    generateShortCode,
} from '../src/short-links/short-code.js';

const COUNT =
    100_000;

const LENGTH = 3;

const seen =
    new Set<string>();

let collisions = 0;

for (
    let index = 0;
    index < COUNT;
    index++
) {
    const code =
        generateShortCode(
            LENGTH,
        );

    if (
        seen.has(code)
    ) {
        collisions++;
    } else {
        seen.add(code);
    }
}

console.log({
    count:
        COUNT,

    length:
        LENGTH,

    space:
        62 ** LENGTH,

    unique:
        seen.size,

    collisions,
});