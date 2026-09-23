import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = __ENV.BASE_URL ?? 'http://localhost:3000';
const RPS = Number(__ENV.RPS ?? 100);
const DURATION = __ENV.DURATION ?? '10s';
const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

// 404 is the expected business response in this penetration test, not an HTTP failure.
http.setResponseCallback(http.expectedStatuses(404));

export const options = {
  scenarios: {
    penetration: {
      executor: 'constant-arrival-rate',
      rate: RPS,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: Number(__ENV.PRE_VUS ?? 50),
      maxVUs: Number(__ENV.MAX_VUS ?? 500),
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    dropped_iterations: ['count==0'],
  },
};

function randomCode() {
  let code = '';

  for (let index = 0; index < 8; index++) {
    code += BASE62[Math.floor(Math.random() * BASE62.length)];
  }

  return code;
}

export default function () {
  const response = http.get(`${BASE_URL}/r/${randomCode()}`, {
    redirects: 0,
    tags: {
      endpoint: 'redirect-penetration',
    },
  });

  check(response, {
    'not found is returned': (result) => result.status === 404,
  });
}
