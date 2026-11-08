import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";
import {
  WindowLimiter,
  withClient,
  admission,
  clientIdentity,
  paidAdmission,
  normalizeClient,
} from "../server/security.js";
import { createTransportApp } from "../server/transport.js";
import { boundedFormData } from "../app/utils/request-guard.server";

afterEach(() => vi.unstubAllEnvs());

describe("request admission", () => {
  it("separates clients and rejects excess requests with retry information", () => {
    vi.stubEnv("SNAPTEX_WEB_RATE_LIMIT", "1");
    expect(withClient("client-a", admission)).toBeUndefined();
    expect(withClient("client-a", admission)).toMatchObject({
      status: 429,
      retryAfter: expect.any(Number),
    });
    expect(withClient("client-b", admission)).toBeUndefined();
  });
  it("fails closed without transport identity for a paid provider", () => {
    vi.stubEnv("RECOGNITION_PROVIDER", "openai");
    expect(admission()).toMatchObject({ status: 503 });
  });
  it("expires idle identities and admits new clients by evicting the oldest entry", () => {
    const limiter = new WindowLimiter(1, 1000, 2);
    expect(limiter.allow("a", 0)).toBe(0);
    expect(limiter.allow("b", 1)).toBe(0);
    expect(limiter.allow("b", 2)).toBeGreaterThan(0);
    expect(limiter.allow("c", 3)).toBe(0);
    expect(limiter.events.has("a")).toBe(false);
    expect(limiter.allow("b", 4)).toBeGreaterThan(0);
    expect(limiter.allow("c", 1003)).toBe(0);
    expect(limiter.events.size).toBe(1);
  });
  it("caps paid calls globally before another SDK request can be made", () => {
    vi.stubEnv("SNAPTEX_OPENAI_REQUESTS_PER_MINUTE", "1");
    expect(paidAdmission()).toBe(0);
    expect(paidAdmission()).toBeGreaterThan(0);
  });
  it("ignores spoofed forwarding headers unless the transport proxy is explicitly trusted", async () => {
    for (const proxies of [[], ["loopback"]]) {
      const app = createTransportApp(proxies);
      app.get("/", (_req, res) => res.json({ client: clientIdentity() }));
      const server = createServer(app);
      await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve),
      );
      try {
        const address = server.address() as { port: number };
        const response = await fetch(`http://127.0.0.1:${address.port}/`, {
          headers: { "X-Forwarded-For": "192.0.2.123, 198.51.100.10" },
        });
        const { client } = await response.json();
        expect(client).toBe(proxies.length ? "198.51.100.10" : "127.0.0.1");
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    }
  });
});

describe("bounded multipart requests", () => {
  it("rejects an excessive Content-Length before consuming the stream", async () => {
    const request = new Request("http://localhost", {
      method: "POST",
      headers: { "content-length": "1000" },
      body: "small",
    });
    await expect(boundedFormData(request, 100)).rejects.toMatchObject({
      status: 413,
    });
  });
  it("rejects oversized chunked input and cancels its source", async () => {
    let cancelled = false;
    const stream = new ReadableStream({
      pull(controller) {
        controller.enqueue(new Uint8Array(60));
      },
      cancel() {
        cancelled = true;
      },
    });
    const request = new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=x" },
      body: stream,
      duplex: "half",
    } as RequestInit);
    await expect(boundedFormData(request, 100)).rejects.toMatchObject({
      status: 413,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(cancelled).toBe(true);
  });
  it("accepts valid multipart input below the limit", async () => {
    const form = new FormData();
    form.set("crop", "test");
    const parsed = await boundedFormData(
      new Request("http://localhost", { method: "POST", body: form }),
      1000,
    );
    expect(parsed.get("crop")).toBe("test");
  });
});

it("groups IPv6 privacy addresses by /64 and normalizes IPv4-mapped addresses", () => {
  expect(normalizeClient("2001:db8:1234:5678::1")).toBe(
    normalizeClient("2001:db8:1234:5678:ffff::2"),
  );
  expect(normalizeClient("2001:db8:1234:5679::1")).not.toBe(
    normalizeClient("2001:db8:1234:5678::1"),
  );
  expect(normalizeClient("::ffff:192.0.2.1")).toBe("192.0.2.1");
});
it("limits a paid client without charging denied requests to other users", () => {
  vi.stubEnv("SNAPTEX_OPENAI_REQUESTS_PER_CLIENT_DAY", "1");
  vi.stubEnv("SNAPTEX_OPENAI_REQUESTS_PER_MINUTE", "991");
  vi.stubEnv("SNAPTEX_OPENAI_REQUESTS_PER_DAY", "2");
  expect(withClient("paid-a", paidAdmission)).toBe(0);
  expect(withClient("paid-a", paidAdmission)).toBeGreaterThan(0);
  expect(withClient("paid-b", paidAdmission)).toBe(0);
  expect(withClient("paid-c", paidAdmission)).toBeGreaterThan(0);
});
it("does not let two slow uploads from one client block another client", async () => {
  const controllers: ReadableStreamDefaultController<Uint8Array>[] = [];
  function slowRequest() {
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        controllers.push(c);
      },
    });
    return new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=x" },
      body,
      duplex: "half",
    } as RequestInit);
  }
  const first = withClient("slow-client", () =>
    boundedFormData(slowRequest(), 1000).catch(() => undefined),
  );
  const second = withClient("slow-client", () =>
    boundedFormData(slowRequest(), 1000).catch(() => undefined),
  );
  try {
    await expect(
      withClient("slow-client", () => boundedFormData(slowRequest(), 1000)),
    ).rejects.toMatchObject({ status: 503 });
    const form = new FormData();
    form.set("ok", "yes");
    const other = await withClient("other-client", () =>
      boundedFormData(
        new Request("http://localhost", { method: "POST", body: form }),
        1000,
      ),
    );
    expect(other.get("ok")).toBe("yes");
  } finally {
    for (const c of controllers.slice(0, 2))
      c.error(new Error("test finished"));
    await Promise.all([first, second]);
  }
});

it("reserves route maxima for unknown-size uploads while leaving room for equations", async () => {
  const controllers: ReadableStreamDefaultController<Uint8Array>[] = [];
  const pending: Promise<unknown>[] = [];
  function request() {
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        controllers.push(c);
      },
    });
    return new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=x" },
      body,
      duplex: "half",
    } as RequestInit);
  }
  const pageLimit = 160 * 1024 * 1024 + 256 * 1024;
  try {
    for (let i = 0; i < 3; i++)
      pending.push(
        withClient(`memory-${i}`, () =>
          boundedFormData(request(), pageLimit).catch(() => undefined),
        ),
      );
    await expect(
      withClient("memory-4", () => boundedFormData(request(), pageLimit)),
    ).rejects.toMatchObject({ status: 503 });
    const form = new FormData();
    form.set("equation", "small");
    const parsed = await withClient("equation-client", () =>
      boundedFormData(
        new Request("http://localhost", { method: "POST", body: form }),
        8 * 1024 * 1024 + 65536,
      ),
    );
    expect(parsed.get("equation")).toBe("small");
  } finally {
    for (const c of controllers.slice(0, 3)) c.error(new Error("finished"));
    await Promise.all(pending);
  }
});
