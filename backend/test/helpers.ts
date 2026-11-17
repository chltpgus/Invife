import { SignJWT } from 'jose';
import pg from 'pg';
import type { Config } from '../src/config';

export const JWT_SECRET = 'test-jwt-secret-0123456789abcdef';
export const LINK_SECRET = 'test-link-secret';

export function adminPool(): pg.Pool {
  return new pg.Pool({
    host: '/var/run/postgresql',
    user: 'ubuntu',
    database: 'invife_test',
    max: 4,
  });
}

export function appPool(): pg.Pool {
  return new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 8,
    connectionTimeoutMillis: 5_000,
  });
}

export async function resetDatabase(admin: pg.Pool): Promise<void> {
  await admin.query(`
    truncate table
      public.rsvp_responses,
      public.recipients,
      public.revoked_tokens,
      public.invitation_photos,
      public.invitation_families,
      public.invitation_accounts,
      public.host_notices,
      public.invitations,
      private.rate_limits,
      private.claim_tickets,
      private.notice_outbox,
      private.budget_alerts,
      private.usage_monthly,
      auth.users
    restart identity cascade
  `);
  await admin.query(`
    update private.app_settings set
      ads_enabled = false,
      spend_cap_cents = null,
      estimate_cents_per_mb = 0,
      estimate_cents_per_draft = 0,
      purge_notice_lead_days = 7,
      purge_delay_days = 30,
      purge_include_host_contact = false,
      purge_include_accounts = false,
      purge_notice_channels = array['dashboard', 'kakao_email'],
      anon_draft_ttl_days = 30,
      hard_delete_after_hours = 24
    where id = 1
  `);
}

export async function insertUser(admin: pg.Pool, id: string, anonymous = false, email: string | null = null): Promise<void> {
  await admin.query(
    `insert into auth.users (id, email, is_anonymous, raw_app_meta_data, raw_user_meta_data)
     values ($1, $2, $3, '{}'::jsonb, '{}'::jsonb)`,
    [id, email, anonymous],
  );
}

export async function accessToken(sub: string, options: { anonymous?: boolean; admin?: boolean } = {}): Promise<string> {
  return new SignJWT({
    role: 'authenticated',
    is_anonymous: Boolean(options.anonymous),
    app_metadata: options.admin ? { role: 'admin' } : {},
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(new TextEncoder().encode(JWT_SECRET));
}

export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    port: 8787,
    databaseUrl: process.env.DATABASE_URL ?? '',
    jwtSecret: JWT_SECRET,
    linkSecret: LINK_SECRET,
    publicBaseUrl: 'http://localhost:8787',
    corsOrigins: ['http://localhost:3000'],
    dataDir: process.env.DATA_DIR || '.data-test',
    turnstileSecret: '',
    turnstileHostname: '',
    kakaoEmailWebhook: '',
    r2: null,
    ...overrides,
    limits: {
      contextPerMinute: 60,
      publicPer10Min: 10,
      publicPerHour: 300,
      personalPerHour: 20,
      draftsPerHour: 20,
      draftsPerIpHour: 60,
      presignPerHour: 60,
      claimsPerHour: 10,
      ...overrides.limits,
    },
  };
}

export async function readJson(response: Response): Promise<{ status: number; body: Record<string, unknown>; retryAfter: string | null }> {
  const text = await response.text();
  return {
    status: response.status,
    body: text ? (JSON.parse(text) as Record<string, unknown>) : {},
    retryAfter: response.headers.get('retry-after'),
  };
}
