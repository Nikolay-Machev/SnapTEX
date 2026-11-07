// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { useDocumentJob, type JobTicket } from '../app/hooks/use-document-job';

const ticket: JobTicket = { id: 'job-1', token: 'secret', status: 'queued', completedPages: 0, totalPages: 2, createdAt: 0, expiresAt: 9999999999999 };
const result = { latex: 'x=1', blocks: [], warnings: [], pageCount: 2, provider: 'test' };
const roots: ReturnType<typeof createRoot>[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); document.body.innerHTML = ''; sessionStorage.clear(); vi.unstubAllGlobals(); });
function View({ accepted }: { accepted?: JobTicket }) {
  const job = useDocumentJob(true, accepted);
  return createElement('div', null, job.result?.latex ?? job.error ?? '', createElement('button', { onClick: job.cancel }, 'Cancel'));
}
async function mount(accepted?: JobTicket) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const div = document.createElement('div'); document.body.append(div);
  const root = createRoot(div); roots.push(root);
  await act(async () => { root.render(createElement(View, { accepted })); });
  return div;
}
it('resumes a saved ticket, polls with its token and displays the completed document', async () => {
  sessionStorage.setItem('snaptex-pending-document', JSON.stringify(ticket));
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ job: { ...ticket, status: 'succeeded', result } }) });
  vi.stubGlobal('fetch', fetch);
  const div = await mount();
  expect(div.textContent).toContain('x=1');
  expect(fetch).toHaveBeenCalledWith('/api/document-jobs/job-1', expect.objectContaining({ headers: { 'X-Snaptex-Job-Token': 'secret' } }));
  expect(sessionStorage.getItem('snaptex-pending-document')).toBeNull();
});
it('cancels an active document and removes its recovery ticket', async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ job: ticket }) });
  vi.stubGlobal('fetch', fetch);
  const div = await mount(ticket);
  await act(async () => div.querySelector('button')!.click());
  expect(fetch).toHaveBeenCalledWith('/api/document-jobs/job-1', expect.objectContaining({ method: 'DELETE' }));
  expect(div.textContent).toContain('cancelled');
  expect(sessionStorage.getItem('snaptex-pending-document')).toBeNull();
});
