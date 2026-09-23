import { CacheCircuitBreakerService } from './cache-circuit-breaker.service.js';

function createMetricsMock() {
  return {
    redirectCacheCircuitState: {
      set: vi.fn(),
    },
    redirectCacheCircuitTransitions: {
      inc: vi.fn(),
    },
    redirectCacheCircuitBypassTotal: {
      inc: vi.fn(),
    },
  };
}

describe('CacheCircuitBreakerService', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('opens after a cache failure and bypasses Redis during cooldown', () => {
    const metrics = createMetricsMock();
    const breaker = new CacheCircuitBreakerService(metrics as never);

    expect(breaker.acquire()).toBe('normal');

    breaker.recordFailure();

    expect(breaker.currentState).toBe('open');
    expect(breaker.acquire()).toBe('bypass');
    expect(metrics.redirectCacheCircuitBypassTotal.inc).toHaveBeenCalledTimes(
      1,
    );
  });

  it('allows one half-open probe after cooldown and closes on success', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-23T00:00:00.000Z'));
    const metrics = createMetricsMock();
    const breaker = new CacheCircuitBreakerService(metrics as never);

    breaker.recordFailure();
    vi.advanceTimersByTime(5_000);

    expect(breaker.acquire()).toBe('probe');
    expect(breaker.currentState).toBe('half-open');
    expect(breaker.acquire()).toBe('bypass');

    breaker.recordSuccess();

    expect(breaker.currentState).toBe('closed');
    expect(breaker.acquire()).toBe('normal');
  });

  it('reopens for a full cooldown when the half-open probe fails', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-23T00:00:00.000Z'));
    const metrics = createMetricsMock();
    const breaker = new CacheCircuitBreakerService(metrics as never);

    breaker.recordFailure();
    vi.advanceTimersByTime(5_000);
    expect(breaker.acquire()).toBe('probe');

    breaker.recordFailure();

    expect(breaker.currentState).toBe('open');
    expect(breaker.acquire()).toBe('bypass');
  });

  it('can be disabled for the baseline comparison', () => {
    vi.stubEnv('CACHE_CIRCUIT_BREAKER_ENABLED', 'false');
    const metrics = createMetricsMock();
    const breaker = new CacheCircuitBreakerService(metrics as never);

    breaker.recordFailure();

    expect(breaker.currentState).toBe('closed');
    expect(breaker.acquire()).toBe('normal');
  });
});
