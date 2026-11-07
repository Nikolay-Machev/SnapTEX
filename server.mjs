import express from 'express';
import { createRequestHandler } from '@react-router/express';
import { createTransportApp } from './server/transport.mjs';

const app = createTransportApp();
const development = process.argv.includes('--dev');
if (development) {
  const vite = await import('vite').then(({ createServer }) => createServer({ server: { middlewareMode: true } }));
  app.use(vite.middlewares);
  app.use(createRequestHandler({ build: () => vite.ssrLoadModule('virtual:react-router/server-build'), mode: 'development' }));
} else {
  app.use('/assets', express.static('build/client/assets', { immutable: true, maxAge: '1y' }));
  app.use(express.static('build/client', { maxAge: '1h' }));
  app.use(createRequestHandler({ build: await import('./build/server/index.js'), mode: 'production' }));
}
const server = app.listen(Number(process.env.PORT ?? 3000), '0.0.0.0', () => console.log('SnapTEX listening on port', server.address().port));
server.requestTimeout = 120000;
server.headersTimeout = 30000;
