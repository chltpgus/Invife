import type { Config } from '../config';
import type { Database } from '../db';
import type { ObjectStorage } from '../photos/storage';

export const APP_DEPS = Symbol('APP_DEPS');

export type AppDeps = {
  pool: Database;
  config: Config;
  storage: ObjectStorage;
  now?: () => Date;
  verifyTurnstile?: (token: string, ip: string) => Promise<'ok' | 'failed' | 'unavailable'>;
  schedule?: (task: () => Promise<void>) => void;
};
