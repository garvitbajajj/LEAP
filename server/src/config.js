require('dotenv').config();

const env = (key, fallback) => process.env[key] ?? fallback;

module.exports = {
  port: Number(env('PORT', 4000)),
  nodeEnv: env('NODE_ENV', 'development'),
  mongoUri: env('MONGO_URI', 'mongodb://127.0.0.1:27017/leap'),
  corsOrigins: env('CORS_ORIGINS', 'http://localhost:5173').split(',').map((s) => s.trim()),
  jwtSecret: env('JWT_SECRET', 'dev-only-insecure-secret'),
  jwtExpiresIn: env('JWT_EXPIRES_IN', '2h'),
  internalBearerToken: env('INTERNAL_BEARER_TOKEN', 'leap-internal-dev-token'),
  bootstrap: {
    enabled: env('BOOTSTRAP_ENABLED', 'true') === 'true',
    user: env('BOOTSTRAP_USER', 'bootstrap'),
    password: env('BOOTSTRAP_PASSWORD', 'bootstrap-dev-password'),
  },
  ml: {
    url: env('ML_URL', 'http://127.0.0.1:8000'),
    apiKey: env('ML_API_KEY', 'leap-dev-ml-key'),
    timeoutMs: Number(env('ML_TIMEOUT_MS', 2000)),
  },
  google: {
    clientId: env('GOOGLE_CLIENT_ID', ''),
    clientSecret: env('GOOGLE_CLIENT_SECRET', ''),
    redirectUri: env('GOOGLE_REDIRECT_URI', 'http://localhost:4000/api/v1/auth/google/callback'),
  },
  version: require('../package.json').version,
};
