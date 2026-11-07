import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { DocumentJobs } from '../app/services/document-jobs.server';

let directory: string;
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'snaptex-jobs-')); });
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });
const images = [{ bytes: new Uint8Array([1,2,3]), mimeType: 'image/png' as const }];
const page = { blocks: [{ id: 'math', type: 'display-math' as const, page: 1, order: 1, content: 'x=1', confidence: null }], warnings: [], provider: 'test' };
async function terminal(store: DocumentJobs, id: string, token: string) {
  for (let i = 0; i < 200; i++) {
    const job = await store.get(id, token);
    if (job && !['queued', 'running'].includes(job.status)) return job;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('Job did not finish');
}

describe('document job queue', () => {
  it('returns a ticket promptly, reports progress, preserves output and removes source files', async () => {
    const store = new DocumentJobs(directory, async () => page);
    const ticket = await store.create(images, 'owner');
    expect(ticket.status).toBe('queued');
    expect(await store.get(ticket.id, '0'.repeat(64))).toBeNull();
    const result = await terminal(store, ticket.id, ticket.token);
    expect(result.status).toBe('succeeded');
    expect(result.completedPages).toBe(1);
    expect(result.result?.latex).toContain('x=1');
    expect(await readdir(join(directory, ticket.id))).toEqual(['state.json']);
    const restarted = new DocumentJobs(directory, async () => { throw new Error('must not rerun a finished job'); });
    expect((await restarted.get(ticket.id, ticket.token))?.result).toEqual(result.result);
  });
  it('bounds per-client queue depth and cancels queued work without running it', async () => {
    const calls: number[] = [];
    const store = new DocumentJobs(directory, async (_, n, signal) => {
      calls.push(n);
      return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('cancel')), { once: true }));
    }, 1000);
    const first = await store.create(images, 'owner');
    const second = await store.create(images, 'owner');
    await expect(store.create(images, 'owner')).rejects.toMatchObject({ status: 503 });
    await store.cancel(second.id, second.token);
    await store.cancel(first.id, first.token);
    expect((await terminal(store, second.id, second.token)).status).toBe('cancelled');
    expect((await terminal(store, first.id, first.token)).status).toBe('cancelled');
    // Let cancellation finish deleting inputs before cleanup.
    for (let i = 0; i < 100; i++) { if (!(await readdir(join(directory, first.id))).includes('0.image')) break; await new Promise(r => setTimeout(r, 5)); }
    expect(calls.length).toBeLessThanOrEqual(1);
  });
  it('marks interrupted work as failed after restart instead of silently repeating inference', async () => {
    const id = randomUUID(), token = 'a'.repeat(64);
    await mkdir(join(directory, id));
    await writeFile(join(directory, id, '0.image'), 'input');
    await writeFile(join(directory, id, 'state.json'), JSON.stringify({ id, tokenHash: createHash('sha256').update(token).digest('hex'), owner: 'owner', status: 'running', types: ['image/png'], inputBytes: 5, completedPages: 0, totalPages: 1, createdAt: Date.now(), expiresAt: Date.now() + 60000 }));
    const store = new DocumentJobs(directory, async () => page);
    expect(await store.get(id, token)).toMatchObject({ status: 'failed', error: expect.stringContaining('restarted') });
    expect(await readdir(join(directory, id))).toEqual(['state.json']);
  });
  it('enforces a processing deadline and records the failure', async () => {
    const store = new DocumentJobs(directory, async (_, __, signal) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(new Error('abort')), { once: true });
    }), 30);
    const ticket = await store.create(images, 'owner');
    expect((await terminal(store, ticket.id, ticket.token)).status).toBe('failed');
    const saved = JSON.parse(await readFile(join(directory, ticket.id, 'state.json'), 'utf8'));
    expect(saved.error).toContain('processing limit');
  });
});
