import 'dotenv/config';
import { NodeSDK } from '@opentelemetry/sdk-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'

const exporter = new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || 'http://localhost:4318/v1/traces',
})

const sdk = new NodeSDK({
    traceExporter: exporter,
    instrumentations: [getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': {
            enabled: false,
        },
    })],
})

sdk.start()

async function shutdown() {
    try {
        await sdk.shutdown();
    } catch (error) {
        console.error('OpenTelemetry shutdown error:', error);
    }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);