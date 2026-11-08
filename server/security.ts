import { AsyncLocalStorage } from "node:async_hooks";
import ipaddr from "ipaddr.js";

const symbol = Symbol.for("snaptex.requestContext");
const globals = globalThis as typeof globalThis & {
  [symbol]: AsyncLocalStorage<string>;
};
const context = (globals[symbol] ??= new AsyncLocalStorage<string>());

/** IPv6 privacy addresses share a quota with their /64. IPv4-mapped addresses
 * share the corresponding IPv4 quota rather than creating a second identity. */
export function normalizeClient(client: string): string {
  if (!ipaddr.isValid(client)) return client;
  const address = ipaddr.process(client);
  if (address.kind() === "ipv4") return address.toString();
  const bytes = address.toByteArray();
  bytes.fill(0, 8);
  return `${ipaddr.fromByteArray(bytes).toString()}/64`;
}
export function withClient<T>(client: string, next: () => T): T {
  return context.run(normalizeClient(client), next);
}
export function clientIdentity(): string | undefined {
  return context.getStore();
}

export class WindowLimiter {
  readonly events = new Map<string, number[]>();
  constructor(
    private limit: number,
    private windowMs: number,
    private maxKeys = 10000,
  ) {}

  private prune(key: string, now: number): number[] {
    const events = this.events.get(key) ?? [];
    while (events.length && events[0] <= now - this.windowMs) events.shift();
    if (!events.length) this.events.delete(key);
    return events;
  }

  /** Map insertion order is last successful use order. Expiration and overflow
   * remove only the oldest entries, amortizing cleanup instead of scanning all. */
  private expire(now: number) {
    for (const [key, events] of this.events) {
      if (events[events.length - 1] > now - this.windowMs) break;
      this.events.delete(key);
    }
  }
  retryAfter(key: string, now = Date.now()): number {
    this.expire(now);
    const events = this.prune(key, now);
    return events.length >= this.limit
      ? Math.max(1, Math.ceil((events[0] + this.windowMs - now) / 1000))
      : 0;
  }
  allow(key: string, now = Date.now()): number {
    const retry = this.retryAfter(key, now);
    if (retry) return retry;
    const events = this.events.get(key) ?? [];
    this.events.delete(key);
    if (this.events.size >= this.maxKeys) {
      const oldest = this.events.keys().next().value;
      if (oldest !== undefined) this.events.delete(oldest);
    }
    events.push(now);
    this.events.set(key, events);
    return 0;
  }
}
const limits = new Map<string, WindowLimiter>();
function limiter(name: string, fallback: number, windowMs: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1)
    throw new Error(`${name} must be a positive integer.`);
  const key = `${name}:${value}:${windowMs}`;
  let instance = limits.get(key);
  if (!instance) {
    instance = new WindowLimiter(value, windowMs);
    limits.set(key, instance);
  }
  return instance;
}
export function admission() {
  const client = clientIdentity();
  if (!client && (process.env.RECOGNITION_PROVIDER ?? "mock") !== "mock") {
    return {
      status: 503,
      message:
        "Recognition requires the SnapTEX server. Start it with npm run dev or npm start.",
      retryAfter: 1,
    };
  }
  const retry = limiter("SNAPTEX_WEB_RATE_LIMIT", 30, 60000).allow(
    client ?? "mock",
  );
  if (retry)
    return {
      status: 429,
      message: "Too many conversions. Please try again later.",
      retryAfter: retry,
    };
}
export function paidAdmission(): number {
  const client = clientIdentity() ?? "mock";
  const quotas: [WindowLimiter, string][] = [
    [limiter("SNAPTEX_OPENAI_REQUESTS_PER_CLIENT_DAY", 10, 86400000), client],
    [limiter("SNAPTEX_OPENAI_REQUESTS_PER_MINUTE", 10, 60000), "all"],
    [limiter("SNAPTEX_OPENAI_REQUESTS_PER_DAY", 100, 86400000), "all"],
  ];
  // Check all buckets before charging any: a denied request spends no budget.
  const now = Date.now();
  const retry = Math.max(
    ...quotas.map(([quota, key]) => quota.retryAfter(key, now)),
  );
  if (retry) return retry;
  for (const [quota, key] of quotas) quota.allow(key, now);
  return 0;
}
