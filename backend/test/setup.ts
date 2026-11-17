import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'env.json');
const env = JSON.parse(readFileSync(envPath, 'utf8')) as Record<string, string>;
Object.assign(process.env, env);
