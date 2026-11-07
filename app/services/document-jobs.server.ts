import { mkdir, readdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomBytes, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import type { DocumentConversionResult, EquationImage, PageRecognitionResult } from '~/recognition/types';
import { createPageRecognizer } from '~/recognition/page-recognizer.server';
import { ConversionError } from '~/utils/errors.server';
import { assembleLatexDocument } from './document-assembler';

export type DocumentJob = {
  id: string; status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  completedPages: number; totalPages: number; createdAt: number; expiresAt: number;
  result?: DocumentConversionResult; error?: string;
};
type StoredJob = DocumentJob & { tokenHash: string; owner: string; inputBytes: number; types: EquationImage['mimeType'][] };
type Runner = (image: EquationImage, page: number, signal: AbortSignal) => Promise<PageRecognitionResult>;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const active = (job: DocumentJob) => job.status === 'queued' || job.status === 'running';
const validId = (id: string) => /^[0-9a-f-]{36}$/.test(id);

export class DocumentJobs {
  private readonly root: string;
  private readonly ready: Promise<void>;
  private jobs = new Map<string, StoredJob>();
  private running = false;
  private completions = new Map<string, Promise<void>>();
  private controller?: AbortController;
  private runningId?: string;
  private writes: Promise<unknown> = Promise.resolve();
  private mutations: Promise<unknown> = Promise.resolve();

  constructor(root: string, private runner: Runner, private deadlineMs = 20 * 60 * 1000) {
    this.root = resolve(root);
    this.ready = this.initialize();
    const timer = setInterval(() => void this.cleanup().catch(() => {}), 60000);
    timer.unref();
  }
  private directory(id: string) { return join(this.root, id); }
  private async persist(job: StoredJob) {
    const operation = this.writes.then(async () => {
      const directory = this.directory(job.id);
      const temporary = join(directory, 'state.tmp');
      await writeFile(temporary, JSON.stringify(job), { mode: 0o600 });
      await rename(temporary, join(directory, 'state.json'));
    });
    this.writes = operation.catch(() => {});
    return operation;
  }

  private async initialize() {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    for (const id of await readdir(this.root)) {
      if (!validId(id)) continue;
      let job: StoredJob;
      try { job = JSON.parse(await readFile(join(this.directory(id), 'state.json'), 'utf8')); }
      catch { await rm(this.directory(id), { recursive: true, force: true }); continue; }
      if (job.expiresAt < Date.now()) { await rm(this.directory(id), { recursive: true, force: true }); continue; }
      if (job.status === 'running') {
        job.status = 'failed'; job.error = 'The server restarted during conversion. Please submit the document again.';
        await this.removeInputs(job); await this.persist(job);
      }
      this.jobs.set(id, job);
    }
    setImmediate(() => void this.pump().catch(() => {}));
  }
  private async removeInputs(job: StoredJob) {
    await Promise.all(job.types.map((_, index) => rm(join(this.directory(job.id), `${index}.image`), { force: true })));
  }
  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.mutations.then(operation);
    this.mutations = next.catch(() => {});
    return next;
  }
  async create(images: EquationImage[], owner: string) {
    await this.ready;
    return this.serialize(async () => {
      await this.cleanup();
      const current = [...this.jobs.values()].filter(active);
      const bytes = images.reduce((sum, image) => sum + image.bytes.byteLength, 0);
      if (current.length >= 8 || current.filter((job) => job.owner === hash(owner)).length >= 2 ||
          current.reduce((sum, job) => sum + job.inputBytes, 0) + bytes > 512 * 1024 * 1024 || this.jobs.size >= 1000)
        throw new ConversionError('SERVICE_BUSY', 'The document queue is full. Try again after an existing job finishes.', 503);
      const token = randomBytes(32).toString('hex');
      const job: StoredJob = { id: randomUUID(), status: 'queued', completedPages: 0, totalPages: images.length,
        createdAt: Date.now(), expiresAt: Date.now() + 60 * 60 * 1000,
        tokenHash: hash(token), owner: hash(owner), inputBytes: bytes, types: images.map((image) => image.mimeType) };
      await mkdir(this.directory(job.id), { mode: 0o700 });
      try {
        for (const [index, image] of images.entries())
          await writeFile(join(this.directory(job.id), `${index}.image`), image.bytes, { mode: 0o600 });
        await this.persist(job);
      } catch (error) { await rm(this.directory(job.id), { recursive: true, force: true }); throw error; }
      this.jobs.set(job.id, job);
      setImmediate(() => void this.pump().catch(() => {}));
      return { ...this.public(job), token };
    });
  }
  private public(job: StoredJob): DocumentJob {
    const { tokenHash: _token, owner: _owner, inputBytes: _bytes, types: _types, ...output } = job;
    return structuredClone(output);
  }
  async get(id: string, token: string): Promise<DocumentJob | null> {
    await this.ready;
    if (!validId(id) || !/^[0-9a-f]{64}$/.test(token)) return null;
    const job = this.jobs.get(id);
    if (!job || job.expiresAt < Date.now() || !timingSafeEqual(Buffer.from(job.tokenHash), Buffer.from(hash(token)))) return null;
    if (!active(job)) await this.completions.get(id);
    return this.public(job);
  }
  async cancel(id: string, token: string) {
    const authorized = await this.get(id, token);
    if (!authorized) return null;
    const job = this.jobs.get(id)!;
    if (active(job)) {
      job.status = 'cancelled';
      if (this.runningId === id) this.controller?.abort();
      else await this.removeInputs(job);
      await this.persist(job);
    }
    return this.public(job);
  }
  private async cleanup() {
    for (const [id, job] of this.jobs) {
      if (job.status === 'queued' && job.createdAt + this.deadlineMs < Date.now()) {
        job.status = 'failed'; job.error = 'The queued document expired. Please submit it again.';
        await this.removeInputs(job); await this.persist(job);
      }
      if (!active(job) && job.expiresAt < Date.now()) {
        this.jobs.delete(id); await rm(this.directory(id), { recursive: true, force: true });
      }
    }
  }
  private async pump() {
    await this.ready;
    if (this.running) return;
    this.running = true;
    try {
      for (const job of this.jobs.values()) {
        if (job.status !== 'queued') continue;
        this.runningId = job.id;
        let complete!: () => void;
        this.completions.set(job.id, new Promise<void>((resolve) => { complete = resolve; }));
        this.controller = new AbortController();
        const timer = setTimeout(() => this.controller?.abort(), Math.max(1, job.createdAt + this.deadlineMs - Date.now()));
        job.status = 'running';
        try {
          await this.persist(job);
          const pages: PageRecognitionResult[] = [];
          for (const [index, mimeType] of job.types.entries()) {
            this.controller.signal.throwIfAborted();
            const bytes = new Uint8Array(await readFile(join(this.directory(job.id), `${index}.image`)));
            pages.push(await this.runner({ bytes, mimeType }, index + 1, this.controller.signal));
            job.completedPages = index + 1;
            await this.persist(job);
          }
          this.controller.signal.throwIfAborted();
          const blocks = pages.flatMap((page) => page.blocks);
          job.result = { blocks, latex: assembleLatexDocument(blocks, job.totalPages), pageCount: job.totalPages,
            warnings: pages.flatMap((page) => page.warnings), provider: [...new Set(pages.map((page) => page.provider))].join(', ') };
          job.status = 'succeeded';
        } catch (error) {
          if ((job as StoredJob).status !== 'cancelled') {
            job.status = 'failed'; job.error = this.controller.signal.aborted ? 'The document exceeded the 20-minute processing limit. Try fewer pages.'
              : error instanceof ConversionError ? error.message : 'Document conversion failed. Please retry the document or individual equations.';
          }
        } finally {
          try {
            clearTimeout(timer); job.expiresAt = Date.now() + 60 * 60 * 1000;
            await this.removeInputs(job); await this.persist(job);
          } finally { complete(); this.completions.delete(job.id); }
        }
      }
    } catch {
      const job = this.runningId ? this.jobs.get(this.runningId) : undefined;
      if (job && active(job)) { job.status = 'failed'; job.error = 'Job storage failed. Please retry after checking server disk space.'; }
    } finally { this.running = false; this.runningId = undefined; this.controller = undefined; }
  }
}

let singleton: DocumentJobs | undefined;
export function documentJobs() {
  return singleton ??= new DocumentJobs(process.env.SNAPTEX_JOB_DIRECTORY ?? '.snaptex-jobs', (image, page, signal) => createPageRecognizer().recognizePage(image, page, signal));
}
