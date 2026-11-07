import { AsyncLocalStorage } from 'node:async_hooks';

const symbol = Symbol.for('snaptex.requestContext');
const context = globalThis[symbol] ??= new AsyncLocalStorage();
export function withClient(client, next) { return context.run(client, next); }
export function clientIdentity() { return context.getStore(); }

export class WindowLimiter {
  constructor(limit, windowMs, maxKeys = 10000) {
    this.limit = limit; this.windowMs = windowMs; this.maxKeys = maxKeys;
    this.events = new Map();
  }
  allow(key, now = Date.now()) {
    // Delete expired keys too, rather than retaining an unbounded IP dictionary.
    for (const [id, events] of this.events) {
      while (events.length && events[0] <= now - this.windowMs) events.shift();
      if (!events.length) this.events.delete(id);
    }
    const events = this.events.get(key) ?? [];
    if ((!this.events.has(key) && this.events.size >= this.maxKeys) || events.length >= this.limit)
      return Math.max(1, Math.ceil(((events[0] ?? now) + this.windowMs - now) / 1000));
    events.push(now); this.events.set(key, events); return 0;
  }
}
const limits = new Map();
function limiter(name, fallback, windowMs) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive integer.`);
  const key = `${name}:${value}:${windowMs}`;
  if (!limits.has(key)) limits.set(key, new WindowLimiter(value, windowMs));
  return limits.get(key);
}
export function admission() {
  const client = clientIdentity();
  // Unit tests and the explicit mock provider may run without a network adapter.
  if (!client && (process.env.RECOGNITION_PROVIDER ?? 'mock') !== 'mock')
    return { status: 503, message: 'Recognition requires the SnapTEX server. Start it with npm run dev or npm start.', retryAfter: 1 };
  const retry = limiter('SNAPTEX_WEB_RATE_LIMIT', 30, 60000).allow(client ?? 'mock');
  if (retry) return { status: 429, message: 'Too many conversions. Please try again later.', retryAfter: retry };
}
export function paidAdmission() {
  const minute = limiter('SNAPTEX_OPENAI_REQUESTS_PER_MINUTE', 10, 60000).allow('all');
  if (minute) return minute;
  return limiter('SNAPTEX_OPENAI_REQUESTS_PER_DAY', 100, 86400000).allow('all');
}
