import http from 'k6/http';

import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL ?? 'http://localhost:3000';

const CODE = __ENV.CODE;

if (!CODE) {
    throw new Error('CODE is required');
}

export const options = {
    vus: 1,

    duration: '10s',

    thresholds: {
        http_req_failed: ['rate<0.01'],

        http_req_duration: ['p(95)<100', 'p(99)<200'],
    },
};

export default function () {
    const response = http.get(`${BASE_URL}/r/${CODE}`, {
        redirects: 0,

        tags: {
            endpoint: 'redirect',
        },
    });

    check(response, {
        'status is 302': (response) => response.status === 302,
    });

    sleep(0.1);
}
