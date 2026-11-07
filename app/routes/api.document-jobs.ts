import { documentJobs } from '~/services/document-jobs.server';
import type { Route } from './+types/api.document-jobs';

async function respond(request: Request, id: string | undefined, cancel = false) {
  const token = request.headers.get('X-Snaptex-Job-Token') ?? '';
  const job = id ? await (cancel ? documentJobs().cancel(id, token) : documentJobs().get(id, token)) : null;
  return Response.json(job ? { success: true, job } : { success: false, error: { code: 'NOT_FOUND', message: 'This job is unavailable or has expired.' } }, {
    status: job ? 200 : 404, headers: { 'Cache-Control': 'no-store' },
  });
}
export async function loader({ request, params }: Route.LoaderArgs) { return respond(request, params.id); }
export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== 'DELETE') return new Response(null, { status: 405, headers: { Allow: 'GET, DELETE' } });
  return respond(request, params.id, true);
}
