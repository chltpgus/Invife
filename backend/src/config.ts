export type Config = {
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  linkSecret: string;
  publicBaseUrl: string;
  corsOrigins: string[];
  dataDir: string;
  turnstileSecret: string;
  turnstileHostname: string;
  kakaoEmailWebhook: string;
  /** 비우면 GET /v1/rebuilds 는 404. 브라우저에 넣지 않는다. */
  rebuildToken: string;
  r2: {
    accountId: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
  } | null;
  limits: {
    contextPerMinute: number;
    publicPer10Min: number;
    publicPerHour: number;
    personalPerHour: number;
    draftsPerHour: number;
    draftsPerIpHour: number;
    presignPerHour: number;
    claimsPerHour: number;
  };
};

function num(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function trimSlash(value: string): string {
  return value.replace(/\/$/, '');
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const accountId = env.R2_ACCOUNT_ID ?? '';
  const accessKeyId = env.R2_ACCESS_KEY_ID ?? '';
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY ?? '';
  const bucket = env.R2_BUCKET ?? '';
  const r2Ready = Boolean(accountId && accessKeyId && secretAccessKey && bucket);
  return {
    port: num(env.PORT, 8787),
    databaseUrl: env.DATABASE_URL ?? '',
    jwtSecret: env.SUPABASE_JWT_SECRET ?? '',
    linkSecret: env.INVIFE_LINK_SECRET ?? '',
    publicBaseUrl: trimSlash(env.INVIFE_PUBLIC_BASE_URL || 'http://localhost:8787'),
    corsOrigins: (env.CORS_ORIGINS || 'http://localhost:3000')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
    dataDir: env.DATA_DIR || '.data',
    turnstileSecret: env.TURNSTILE_SECRET_KEY ?? '',
    turnstileHostname: env.TURNSTILE_HOSTNAME ?? '',
    kakaoEmailWebhook: env.KAKAO_EMAIL_WEBHOOK ?? '',
    rebuildToken: env.STATIC_REBUILD_TOKEN ?? '',
    r2: r2Ready ? { accountId, accessKeyId, secretAccessKey, bucket } : null,
    limits: {
      contextPerMinute: num(env.RATE_LIMIT_CONTEXT_PER_MINUTE, 60),
      publicPer10Min: num(env.RATE_LIMIT_PUBLIC_PER_10_MIN, 10),
      publicPerHour: num(env.RATE_LIMIT_PUBLIC_PER_HOUR, 300),
      personalPerHour: num(env.RATE_LIMIT_PERSONAL_PER_HOUR, 20),
      draftsPerHour: num(env.RATE_LIMIT_DRAFTS_PER_HOUR, 20),
      draftsPerIpHour: num(env.RATE_LIMIT_DRAFTS_PER_IP_HOUR, 60),
      presignPerHour: num(env.RATE_LIMIT_PRESIGN_PER_HOUR, 60),
      claimsPerHour: num(env.RATE_LIMIT_CLAIMS_PER_HOUR, 10),
    },
  };
}
