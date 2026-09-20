import { SnowflakeGenerator } from '../src/common/id/snowflake.js';

import { encodeBase62 } from '../src/common/utils/base62.js';

const generator = new SnowflakeGenerator(1);

for (let index = 0; index < 10; index++) {
    const id = generator.nextId();

    const code = encodeBase62(id);

    console.log({
        id: id.toString(),

        code,

        length: code.length,
    });
}
