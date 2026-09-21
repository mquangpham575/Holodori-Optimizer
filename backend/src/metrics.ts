// Lightweight in-process counters exposed at GET /api/metrics. Kept dependency
// free on purpose — enough for a showcase without pulling in a Prometheus stack.
interface Metrics {
  requests: number;
  byRoute: Record<string, number>;
  byStatus: Record<string, number>;
  startedAt: string;
}

const metrics: Metrics = {
  requests: 0,
  byRoute: {},
  byStatus: {},
  startedAt: new Date().toISOString(),
};

export const recordRequest = (route: string, status: number) => {
  metrics.requests += 1;
  metrics.byRoute[route] = (metrics.byRoute[route] || 0) + 1;
  const statusKey = `${status}`;
  metrics.byStatus[statusKey] = (metrics.byStatus[statusKey] || 0) + 1;
};

export const getMetrics = (): Metrics => ({
  ...metrics,
  byRoute: { ...metrics.byRoute },
  byStatus: { ...metrics.byStatus },
});
