import { createServer } from 'node:http';
import { createApp } from './app';
import { loadConfig } from './config';
import { createPool } from './db';
import { createStorage } from './photos/storage';

const config = loadConfig();
if (!config.databaseUrl || !config.jwtSecret || !config.linkSecret) {
  throw new Error('DATABASE_URL, SUPABASE_JWT_SECRET, INVIFE_LINK_SECRET 가 필요합니다.');
}

const app = createApp({ pool: createPool(config.databaseUrl), config, storage: createStorage(config) });
const server = createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const request = new Request(url, {
    method: req.method,
    headers: req.headers as HeadersInit,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
  });
  const response = await app.fetch(request);
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.end(Buffer.from(await response.arrayBuffer()));
});

server.listen(config.port, () => {
  console.log(`invife backend http://localhost:${config.port}`);
});
