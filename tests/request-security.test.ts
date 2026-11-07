import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import { WindowLimiter, withClient, admission, clientIdentity, paidAdmission } from '../server/security.mjs';
import { createTransportApp } from '../server/transport.mjs';
import { boundedFormData } from '../app/utils/request-guard.server';

afterEach(() => vi.unstubAllEnvs());

describe('request admission', () => {
  it('separates clients and rejects excess requests with retry information', () => {
    vi.stubEnv('SNAPTEX_WEB_RATE_LIMIT', '1');
    expect(withClient('client-a', admission)).toBeUndefined();
    expect(withClient('client-a', admission)).toMatchObject({ status: 429, retryAfter: expect.any(Number) });
    expect(withClient('client-b', admission)).toBeUndefined();
  });
  it('fails closed without transport identity for a paid provider', () => {
    vi.stubEnv('RECOGNITION_PROVIDER', 'openai');
    expect(admission()).toMatchObject({ status: 503 });
  });
  it('evicts expired identities and bounds the live key count without resetting active quotas', () => {
    const limiter = new WindowLimiter(1, 1000, 2);
    expect(limiter.allow('a', 0)).toBe(0);
    expect(limiter.allow('b', 1)).toBe(0);
    expect(limiter.allow('c', 2)).toBeGreaterThan(0);
    expect(limiter.allow('a', 3)).toBeGreaterThan(0);
    expect(limiter.allow('c', 1002)).toBe(0);
    expect(limiter.events.size).toBe(1);
  });
  it('caps paid calls globally before another SDK request can be made', () => {
    vi.stubEnv('SNAPTEX_OPENAI_REQUESTS_PER_MINUTE', '1');
    expect(paidAdmission()).toBe(0);
    expect(paidAdmission()).toBeGreaterThan(0);
  });
  it('ignores spoofed forwarding headers unless the transport proxy is explicitly trusted', async () => {
    for (const proxies of [[], ['loopback']]) {
      const app = createTransportApp(proxies);
      app.get('/', (_req, res) => res.json({ client: clientIdentity() }));
      const server = createServer(app);
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      try {
        const address = server.address() as { port: number };
        const response = await fetch(`http://127.0.0.1:${address.port}/`, { headers: { 'X-Forwarded-For': '192.0.2.123, 198.51.100.10' } });
        const { client } = await response.json();
        expect(client).toBe(proxies.length ? '198.51.100.10' : '127.0.0.1');
      } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
    }
  });
});

describe('bounded multipart requests', () => {
  it('rejects an excessive Content-Length before consuming the stream', async () => {
    const request = new Request('http://localhost', { method: 'POST', headers: { 'content-length': '1000' }, body: 'small' });
    await expect(boundedFormData(request, 100)).rejects.toMatchObject({ status: 413 });
  });
  it('rejects oversized chunked input and cancels its source', async () => {
    let cancelled = false;
    const stream = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(60)); }, cancel() { cancelled = true; } });
    const request = new Request('http://localhost', { method: 'POST', headers: { 'content-type': 'multipart/form-data; boundary=x' }, body: stream, duplex: 'half' } as RequestInit);
    await expect(boundedFormData(request, 100)).rejects.toMatchObject({ status: 413 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(cancelled).toBe(true);
  });
  it('accepts valid multipart input below the limit', async () => {
    const form = new FormData(); form.set('crop', 'test');
    const parsed = await boundedFormData(new Request('http://localhost', { method: 'POST', body: form }), 1000);
    expect(parsed.get('crop')).toBe('test');
  });
});
