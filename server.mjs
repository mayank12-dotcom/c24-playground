import http from 'node:http';
import { createServer } from 'vite';
import { createMemoryWorld, createRedisWorld, handleWorldRequest } from './api/world.js';

const port = Number(process.env.PORT) || 4173;
const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'spa' });
const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const store = url && token ? createRedisWorld({ url, token }) : createMemoryWorld();
const server = http.createServer((req, res) => {
  if (new URL(req.url, 'http://localhost').pathname === '/api/world') return handleWorldRequest(req, res, store);
  vite.middlewares(req, res);
});
server.listen(port, '0.0.0.0', () => process.stdout.write(`Common Ground is running at http://localhost:${port}\nLive visitors: ${url && token ? 'shared Redis' : 'this local server'}\n`));
const close = async () => { await vite.close(); server.close(() => process.exit()); };
process.once('SIGINT', close);
process.once('SIGTERM', close);
