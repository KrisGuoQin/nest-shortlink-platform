import http from 'k6/http';

import { check } from 'k6';

const BASE_URL = __ENV.BASE_URL ?? 'http://localhost:3000';

const CODE = __ENV.CODE;

const RPS = Number(__ENV.RPS ?? 500);

const DURATION = __ENV.DURATION ?? '60s';

if (!CODE) {
    throw new Error('CODE is required');
}

export const options = {
    scenarios: {
        redirect: {
            executor: 'constant-arrival-rate',
            rate: RPS,
            timeUnit: '1s',
            duration: DURATION,
            preAllocatedVUs: Number(__ENV.PRE_VUS ?? 100),
            maxVUs: Number(__ENV.MAX_VUS ?? 2000),
        },
    },

    thresholds: {
        http_req_failed: ['rate<0.01'],
        http_req_duration: ['p(95)<50', 'p(99)<100'],
        dropped_iterations: ['count==0'],
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
        'redirect is 302': (response) => response.status === 302,
    });
}
