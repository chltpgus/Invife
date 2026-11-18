import { createApp } from './app';
import { loadConfig } from './config';
import { createPool } from './db';
import { createStorage } from './photos/storage';

const config = loadConfig();
if (!config.databaseUrl || !config.jwtSecret || !config.linkSecret) {
  throw new Error('DATABASE_URL, SUPABASE_JWT_SECRET, INVIFE_LINK_SECRET 가 필요합니다.');
}

const app = await createApp({ pool: createPool(config.databaseUrl), config, storage: createStorage(config) });
await app.listen(config.port);
console.log(`invife backend http://localhost:${config.port}`);
