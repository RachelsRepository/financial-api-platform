import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { FastifyInstrumentation } from '@opentelemetry/instrumentation-fastify';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import type { AppConfig } from '../config/configuration';

let sdk: NodeSDK | null = null;

export function initializeTracing(config: AppConfig): NodeSDK | null {
  if (!config.OTEL_ENABLED) {
    return null;
  }

  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);

  sdk = new NodeSDK({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: config.APP_NAME,
    }),
    traceExporter: new OTLPTraceExporter({
      url: `${config.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`,
    }),
    instrumentations: [
      new HttpInstrumentation(),
      // Kept for Nest+Fastify bootstrap until @fastify/otel is wired end-to-end.
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- transitional instrumentation
      new FastifyInstrumentation(),
      new IORedisInstrumentation(),
    ],
  });

  sdk.start();
  return sdk;
}

export async function shutdownTracing(): Promise<void> {
  if (sdk === null) {
    return;
  }
  await sdk.shutdown();
  sdk = null;
}
