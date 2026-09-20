import 'dotenv/config';

import { Client } from 'pg';

import { encodeBase62 } from '../src/common/utils/base62.js';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    throw new Error('DATABASE_URL is not defined');
}

const client = new Client({
    connectionString,
});

async function main() {
    await client.connect();

    await client.query(`
    CREATE SEQUENCE IF NOT EXISTS
    short_code_lab_seq
    START WITH 1
    INCREMENT BY 1;
  `);

    for (let index = 0; index < 10; index++) {
        const result = await client.query<{
            id: string;
        }>(`
        SELECT
          nextval(
            'short_code_lab_seq'
          ) AS id;
      `);

        const id = BigInt(result.rows[0].id);

        console.log({
            id: id.toString(),

            code: encodeBase62(id),
        });
    }
}

main()
    .catch(console.error)
    .finally(async () => {
        await client.end();
    });
