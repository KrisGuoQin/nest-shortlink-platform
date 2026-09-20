import { SnowflakeGenerator } from '../src/common/id/snowflake.js';

import { encodeBase62 } from '../src/common/utils/base62.js';

import { generateShortCode } from '../src/short-links/short-code.js';

const COUNT = 100_000;

function check(name: string, generator: () => string) {
    const set = new Set<string>();

    let collisions = 0;

    for (let index = 0; index < COUNT; index++) {
        const code = generator();

        if (set.has(code)) {
            collisions++;
        }

        set.add(code);
    }

    console.log({
        name,

        count: COUNT,

        unique: set.size,

        collisions,
    });
}

let sequentialId = 0n;

check('DB-style sequence', () => {
    sequentialId++;

    return encodeBase62(sequentialId);
});

const snowflake = new SnowflakeGenerator(1);

check('Snowflake', () => encodeBase62(snowflake.nextId()));

check('Random Base62 8', () => generateShortCode(8));

check('Random Base62 3', () => generateShortCode(3));
