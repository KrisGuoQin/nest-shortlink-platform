export const BASE62 =
    '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

const BASE = BigInt(BASE62.length);

export function encodeBase62(value: bigint): string {
    if (value < 0n) {
        throw new Error('Base62 only supports non-negative integers');
    }

    if (value === 0n) {
        return '0';
    }

    let current = value;

    let result = '';

    while (current > 0n) {
        const remainder = current % BASE;

        result = BASE62[Number(remainder)] + result;

        current = current / BASE;
    }

    return result;
}

export function decodeBase62(code: string): bigint {
    if (!code) {
        throw new Error('Base62 code cannot be empty');
    }

    let result = 0n;

    for (const character of code) {
        const index = BASE62.indexOf(character);

        if (index === -1) {
            throw new Error(`Invalid Base62 character: ${character}`);
        }

        result = result * BASE + BigInt(index);
    }

    return result;
}
