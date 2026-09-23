import { Injectable } from '@nestjs/common';

import { MetricsService } from '../metrics/metrics.service.js';

export type CacheCircuitState = 'closed' | 'open' | 'half-open';
export type CacheCircuitPermit = 'normal' | 'probe' | 'bypass';

@Injectable()
export class CacheCircuitBreakerService {
  private state: CacheCircuitState = 'closed';
  private failureCount = 0;
  private openedAt = 0;
  private probeInFlight = false;

  constructor(private readonly metrics: MetricsService) {
    this.metrics.redirectCacheCircuitState.set({ state: 'closed' }, 1);
    this.metrics.redirectCacheCircuitState.set({ state: 'open' }, 0);
    this.metrics.redirectCacheCircuitState.set({ state: 'half-open' }, 0);
  }

  get currentState() {
    return this.state;
  }

  acquire(): CacheCircuitPermit {
    if (process.env.CACHE_CIRCUIT_BREAKER_ENABLED === 'false') {
      return 'normal';
    }

    if (this.state === 'closed') {
      return 'normal';
    }

    if (this.state === 'open') {
      if (Date.now() - this.openedAt < this.openDurationMs) {
        this.metrics.redirectCacheCircuitBypassTotal.inc();
        return 'bypass';
      }

      this.transitionTo('half-open');
    }

    if (this.probeInFlight) {
      this.metrics.redirectCacheCircuitBypassTotal.inc();
      return 'bypass';
    }

    this.probeInFlight = true;
    return 'probe';
  }

  recordSuccess() {
    if (process.env.CACHE_CIRCUIT_BREAKER_ENABLED === 'false') {
      return;
    }

    this.failureCount = 0;
    this.probeInFlight = false;
    this.transitionTo('closed');
  }

  recordFailure() {
    if (process.env.CACHE_CIRCUIT_BREAKER_ENABLED === 'false') {
      return;
    }

    this.probeInFlight = false;

    // Concurrent requests may all fail from the same outage. Do not extend
    // the cooldown for every late failure after the circuit is already open.
    if (this.state === 'open') {
      return;
    }

    this.failureCount += 1;

    if (
      this.state === 'half-open' ||
      this.failureCount >= this.failureThreshold
    ) {
      this.openedAt = Date.now();
      this.transitionTo('open');
    }
  }

  private get failureThreshold() {
    return this.positiveIntegerFromEnv('CACHE_CIRCUIT_FAILURE_THRESHOLD', 1);
  }

  private get openDurationMs() {
    return this.positiveIntegerFromEnv('CACHE_CIRCUIT_OPEN_MS', 5_000);
  }

  private positiveIntegerFromEnv(name: string, fallback: number) {
    const value = Number(process.env[name]);
    return Number.isInteger(value) && value > 0 ? value : fallback;
  }

  private transitionTo(next: CacheCircuitState) {
    if (this.state === next) {
      return;
    }

    const previous = this.state;
    this.state = next;
    this.metrics.redirectCacheCircuitState.set({ state: previous }, 0);
    this.metrics.redirectCacheCircuitState.set({ state: next }, 1);
    this.metrics.redirectCacheCircuitTransitions.inc({
      from: previous,
      to: next,
    });
  }
}
