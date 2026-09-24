import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('..', import.meta.url));
const packageJson = JSON.parse(readFileSync(`${cwd}/package.json`, 'utf8'));

function assertPreloaded(command, entryPoint) {
  const instrumentationIndex = command.indexOf('telemetry/instrumentation.');
  const entryPointIndex = command.indexOf(entryPoint);
  assert.ok(instrumentationIndex >= 0, `${entryPoint} is missing OTel preload`);
  assert.ok(
    instrumentationIndex < entryPointIndex,
    `OTel must load before ${entryPoint}`,
  );
}

function config(mode, replicas = '3') {
  const production = mode === 'prod';
  const args = [
    'compose',
    '--env-file',
    production ? '.env.production.example' : '.env.compose.example',
    '-f',
    'docker-compose.yml',
  ];
  if (mode !== 'dev') args.push('-f', 'docker-compose.demo.yml');
  if (production) args.push('-f', 'docker-compose.prod.yml');
  args.push('config', '--format', 'json');
  return JSON.parse(
    execFileSync('docker', args, {
      cwd,
      env: {
        ...process.env,
        API_REPLICAS: replicas,
        APP_ENV_FILE: production ? '.env.production.example' : '.env.docker',
      },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
  );
}

const dev = config('dev');
const demo = config('demo');
const prod = config('prod', '9');
assert.equal(dev.services.api, undefined);
assert.equal(dev.services.nginx.depends_on, undefined);
assert.equal(
  dev.services.nginx.environment.API_UPSTREAM,
  'host.docker.internal:3000',
);
assert.equal(dev.services.nginx.environment.API_RESOLVE, '');
// Compose escapes literal dollars in its serialized model.
assert.ok(
  ['$upstream_addr', '$$upstream_addr'].includes(
    dev.services.nginx.environment.DEBUG_UPSTREAM,
  ),
);
assert.equal(demo.services.api.deploy.replicas, 3);
assert.equal(config('demo', '1').services.api.deploy.replicas, 1);
assert.equal(demo.services.api.container_name, undefined);
assert.equal(demo.services.api.ports, undefined);
assert.equal(demo.services.nginx.environment.API_UPSTREAM, 'api:3000');
assert.equal(demo.services.nginx.environment.API_RESOLVE, 'resolve');
assert.equal(prod.services.api.deploy.replicas, 1);
assert.equal(prod.services.nginx.environment.DEBUG_UPSTREAM, '');
assert.equal(prod.services.nginx.ports.length, 1);
assert.equal(prod.services.nginx.ports[0].published, '80');
for (const [name, service] of Object.entries(dev.services)) {
  assert.ok(prod.services[name], `production lost ${name}`);
  assert.ok(
    Object.hasOwn(service.networks, 'shortlink'),
    `${name} is not on the application network`,
  );
}
for (const [name, service] of Object.entries(prod.services)) {
  assert.ok(service.mem_limit > 0, `${name} needs a memory budget`);
  if (name !== 'nginx') {
    for (const port of service.ports ?? [])
      assert.equal(port.host_ip, '127.0.0.1', `${name} exposes a public port`);
  }
}
for (const name of ['postgres', 'redis', 'redis-cluster']) {
  assert.equal(prod.services[name].ports?.length ?? 0, 0);
}
assert.equal(
  prod.services.api.environment.DATABASE_URL,
  'postgresql://shortlink:CHANGE_ME_POSTGRES@postgres:5432/shortlink?schema=public',
);
assert.equal(
  prod.services.api.environment.RABBITMQ_URL,
  'amqp://shortlink:CHANGE_ME_RABBITMQ@rabbitmq:5672',
);
assert.equal(
  prod.services.api.environment.REDIS_CLUSTER_NODES,
  'redis-cluster:7100,redis-cluster:7101,redis-cluster:7102',
);
assert.equal(
  prod.services['redis-cluster'].environment.REDIS_CLUSTER_HOSTNAME,
  'redis-cluster',
);
for (const script of [
  'start',
  'start:dev',
  'start:worker',
  'start:worker:dev',
  'start:outbox',
  'start:outbox:dev',
]) {
  assert.ok(
    packageJson.scripts[script].includes(
      "--exec 'node --import ./dist/telemetry/instrumentation.js'",
    ),
    `${script} must preload OTel in the Nest child process`,
  );
}
for (const [script, entryPoint] of Object.entries({
  'start:prod': './dist/main.js',
  'start:worker:prod': './dist/analytics-worker/main.js',
  'start:outbox:prod': './dist/outbox-worker/main.js',
})) {
  assertPreloaded(packageJson.scripts[script], entryPoint);
}
const dockerfile = readFileSync(`${cwd}/Dockerfile`, 'utf8');
assertPreloaded(dockerfile, './dist/main.js');
assert.match(
  dockerfile,
  /prisma migrate deploy[^\n]+&& pnpm run seed:rbac/,
  'migration image must initialize RBAC after applying migrations',
);
for (const serviceName of ['analytics-worker', 'outbox-worker']) {
  const command = prod.services[serviceName].command.join(' ');
  assertPreloaded(command, `dist/${serviceName}/main.js`);
  assert.equal(
    prod.services[serviceName].depends_on['otel-collector'].condition,
    'service_started',
  );
}
assert.equal(
  prod.services.api.depends_on['otel-collector'].condition,
  'service_started',
);
assert.equal(
  prod.services.api.environment.OTEL_TRACES_SAMPLER,
  'parentbased_traceidratio',
);
assert.equal(prod.services.jaeger.image, 'jaegertracing/jaeger:2.21.0');
assert.deepEqual(prod.services.jaeger.command, [
  '--set=extensions.jaeger_storage.backends.some_storage.memory.max_traces=5000',
]);
console.log(
  'PASS: routing, replicas, services, ports, budgets and OTel preload order',
);
