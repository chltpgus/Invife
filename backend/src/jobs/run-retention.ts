import { loadConfig } from '../config';
import { createPool } from '../db';
import { runRetention } from './retention';
import { createStorage } from '../photos/storage';

const config = loadConfig();
const pool = createPool(config.databaseUrl);
const stats = await runRetention(pool, createStorage(config), config.kakaoEmailWebhook);
console.log(JSON.stringify(stats));
await pool.end();
