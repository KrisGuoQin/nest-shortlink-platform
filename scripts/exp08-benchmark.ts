import { performance } from 'node:perf_hooks';

import { SnowflakeGenerator } from '../src/common/id/snowflake.js';

import { encodeBase62 } from '../src/common/utils/base62.js';

import { generateShortCode } from '../src/short-links/short-code.js';

const COUNT = 100_000;

function benchmark(name: string, fn: () => void) {
    const start = performance.now();

    fn();

    const duration = performance.now() - start;

    console.log({
        name,

        count: COUNT,

        durationMs: duration.toFixed(2),

        operationsPerSecond: Math.round(COUNT / (duration / 1000)),
    });
}

benchmark('Sequential ID + Base62', () => {
    for (let index = 1; index <= COUNT; index++) {
        encodeBase62(BigInt(index));
    }
});

const snowflake = new SnowflakeGenerator(1);

benchmark('Snowflake + Base62', () => {
    for (let index = 0; index < COUNT; index++) {
        const id = snowflake.nextId();

        encodeBase62(id);
    }
});

benchmark('Random Base62', () => {
    for (let index = 0; index < COUNT; index++) {
        generateShortCode(8);
    }
});
