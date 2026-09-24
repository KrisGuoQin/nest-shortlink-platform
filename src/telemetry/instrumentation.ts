import 'dotenv/config';

import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { NodeSDK } from '@opentelemetry/sdk-node';

// Load this module with Node's --import option. Importing it from a business
// entry point is too late because HTTP/database packages may already be loaded.
process.env.OTEL_SERVICE_NAME ??= 'shortlink-api';
// Prometheus is the metrics backend for this project; keep this SDK trace-only.
process.env.OTEL_METRICS_EXPORTER ??= 'none';
process.env.OTEL_LOGS_EXPORTER ??= 'none';

const instanceId =
  process.env.OTEL_SERVICE_INSTANCE_ID ??
  process.env.APP_INSTANCE_ID ??
  process.env.HOSTNAME ??
  `${process.env.OTEL_SERVICE_NAME}-${process.pid}`;

const resourceAttributes =
  process.env.OTEL_RESOURCE_ATTRIBUTES?.split(',')
    .map((attribute) => attribute.trim())
    .filter(Boolean) ?? [];

if (
  !resourceAttributes.some((attribute) =>
    attribute.startsWith('service.instance.id='),
  )
) {
  resourceAttributes.push(`service.instance.id=${instanceId}`);
  process.env.OTEL_RESOURCE_ATTRIBUTES = resourceAttributes.join(',');
}

const exporter = new OTLPTraceExporter({
  url:
    process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ??
    'http://localhost:4318/v1/traces',
});

const sdk = new NodeSDK({
  traceExporter: exporter,
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': {
        enabled: false,
      },
    }),
  ],
});

sdk.start();

let shutdownPromise: Promise<void> | undefined;

export function shutdownTelemetry(): Promise<void> {
  shutdownPromise ??= sdk.shutdown().catch((error: unknown) => {
    console.error('OpenTelemetry shutdown error:', error);
  });

  return shutdownPromise;
}

function handleShutdownSignal() {
  void shutdownTelemetry();
}

process.once('SIGINT', handleShutdownSignal);
process.once('SIGTERM', handleShutdownSignal);
process.once('beforeExit', () => {
  void shutdownTelemetry();
});
