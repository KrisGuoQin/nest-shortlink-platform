import { Injectable } from '@nestjs/common';
import {
  Registry,
  Counter,
  Gauge,
  Histogram,
  collectDefaultMetrics,
} from '@prometheus-io/client';

@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  /**
   * Metrics for HTTP requests, including method, route, and status code.
   */
  readonly httpRequests = new Counter({
    name: 'shortlink_http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code'] as const,
    registers: [this.registry],
  });

  /**
   * Metrics for HTTP request duration, including method, route, and status code.
   */
  readonly httpDuration = new Histogram({
    name: 'shortlink_http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status_code'] as const,
    registers: [this.registry],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  });

  /**
   * Metrics for short link redirects, including the result of each redirect.
   */
  readonly redirectTotal = new Counter({
    name: 'shortlink_redirect_total',
    help: 'Total short link redirect result',
    labelNames: ['result'] as const,
    registers: [this.registry],
  });

  /**
   * Metrics for redirect cache lookups, including the result of each lookup.
   */
  readonly redirectCacheTotal = new Counter({
    name: 'shortlink_redirect_cache_total',
    help: 'Redirect cache lookup results',
    labelNames: ['result'] as const,
    registers: [this.registry],
  });

  readonly redirectCacheCircuitState = new Gauge({
    name: 'shortlink_redirect_cache_circuit_state',
    help: 'Current redirect cache circuit breaker state',
    labelNames: ['state'] as const,
    registers: [this.registry],
  });

  readonly redirectCacheCircuitTransitions = new Counter({
    name: 'shortlink_redirect_cache_circuit_transitions_total',
    help: 'Redirect cache circuit breaker state transitions',
    labelNames: ['from', 'to'] as const,
    registers: [this.registry],
  });

  readonly redirectCacheCircuitBypassTotal = new Counter({
    name: 'shortlink_redirect_cache_circuit_bypass_total',
    help: 'Requests that bypassed Redis while the circuit was open',
    registers: [this.registry],
  });

  /**
   * Metrics for visit event publications, including the result of each publication.
   */
  readonly visitEventPublishTotal = new Counter({
    name: 'shortlink_visit_event_publish_total',
    help: 'Visit event publish result',
    labelNames: ['result'] as const,
    registers: [this.registry],
  });

  /**
   * Metrics for analytics events, including the result of each event.
   */
  readonly analyticsEventsTotal = new Counter({
    name: 'shortlink_analytics_events_total',
    help: 'Analytics consumer event results',
    labelNames: ['result'] as const,
    registers: [this.registry],
  });

  /**
   * Metrics for outbox publish results, including the result of each publish.
   */
  readonly outboxPublishTotal = new Counter({
    name: 'shortlink_outbox_publish_total',
    help: 'Outbox publish results',
    labelNames: ['result'] as const,
    registers: [this.registry],
  });

  constructor() {
    this.registry.setDefaultLabels({
      service: process.env.METRICS_SERVICE_NAME || 'shortlink-api',
    });

    collectDefaultMetrics({
      register: this.registry,
      eventLoopMonitoringPrecision: 10,
    });
  }

  async render() {
    return await this.registry.metrics();
  }

  getContentType() {
    return this.registry.contentType;
  }
}
