/**
 * Client for the ML service (contract C3) with a timeout, one retry, and a circuit
 * breaker. Callers treat any thrown error as "use the fallback".
 */
const config = require('../config');
const logger = require('../logger');

const FAILURE_THRESHOLD = 5;
const OPEN_MS = 30_000;

const breaker = { failures: 0, openUntil: 0 };

const isOpen = () => Date.now() < breaker.openUntil;

function recordFailure() {
  breaker.failures += 1;
  if (breaker.failures >= FAILURE_THRESHOLD) {
    breaker.openUntil = Date.now() + OPEN_MS;
    breaker.failures = 0;
    logger.warn({ openForMs: OPEN_MS }, 'ml circuit breaker opened');
  }
}

async function callOnce(path, body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.ml.timeoutMs);
  try {
    const res = await fetch(`${config.ml.url}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': config.ml.apiKey },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const err = new Error(`ml responded ${res.status}`);
      err.retryable = res.status >= 500;
      throw err;
    }
    return await res.json();
  } catch (err) {
    if (err.name === 'AbortError' || err.cause?.code === 'ECONNREFUSED') err.retryable = true;
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function recommend(payload) {
  if (isOpen()) throw new Error('ml circuit breaker is open');
  try {
    let result;
    try {
      result = await callOnce('/ml/v1/recommend', payload);
    } catch (err) {
      if (!err.retryable) throw err;
      result = await callOnce('/ml/v1/recommend', payload);
    }
    breaker.failures = 0;
    return result;
  } catch (err) {
    recordFailure();
    throw err;
  }
}

module.exports = { recommend, breaker, isOpen };
