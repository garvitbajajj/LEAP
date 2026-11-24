const client = require('prom-client');

const register = new client.Registry();
client.collectDefaultMetrics({ register, prefix: 'leap_' });

const httpDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
  registers: [register],
});

const recommendationFallbacks = new client.Counter({
  name: 'leap_recommendation_fallback_total',
  help: 'Recommendation requests served by the popularity fallback',
  registers: [register],
});

const feedCacheResults = new client.Counter({
  name: 'leap_recommendation_cache_total',
  help: 'Feed cache lookups by result: hit, miss, bypass (Redis unavailable) or error',
  labelNames: ['result'],
  registers: [register],
});

function metricsMiddleware(req, res, next) {
  const end = httpDuration.startTimer({ method: req.method });
  res.on('finish', () => {
    const route = req.route ? req.baseUrl + req.route.path : 'unmatched';
    end({ route, status: res.statusCode });
  });
  next();
}

module.exports = {
  register, metricsMiddleware, recommendationFallbacks, feedCacheResults,
};
