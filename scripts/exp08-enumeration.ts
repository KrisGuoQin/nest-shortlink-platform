import { decodeBase62, encodeBase62 } from '../src/common/utils/base62.js';

const knownCode = encodeBase62(1_000_000n);

const knownId = decodeBase62(knownCode);

console.log({
    knownCode,

    knownId: knownId.toString(),

    previous: encodeBase62(knownId - 1n),

    next: encodeBase62(knownId + 1n),
});
