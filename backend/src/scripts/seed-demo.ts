import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { linkToken, recipientMaterial, sharedMaterial, tokenHash } from '../domain/tokens';

const adminUrl = process.env.ADMIN_DATABASE_URL || process.env.DATABASE_URL;
const linkSecret = process.env.INVIFE_LINK_SECRET;
if (!adminUrl || !linkSecret) {
  throw new Error('ADMIN_DATABASE_URL 과 INVIFE_LINK_SECRET 이 필요합니다. 마이그레이션을 먼저 적용하세요.');
}

const owner = randomUUID();
const invitation = randomUUID();
const recipient = randomUUID();
const personal = linkToken(linkSecret, recipientMaterial(recipient, 1));
const shared = linkToken(linkSecret, sharedMaterial(invitation, 1));
const slug = 'demoinvite1';

const client = new pg.Client({ connectionString: adminUrl });
await client.connect();
await client.query('begin');
const columns = await client.query<{ column_name: string }>(
  `select column_name from information_schema.columns where table_schema = 'auth' and table_name = 'users'`,
);
const names = new Set(columns.rows.map((row) => row.column_name));
if (names.has('instance_id')) {
  await client.query(
    `insert into auth.users (
       instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
       raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_anonymous
     ) values (
       '00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated',
       'demo@example.com', '', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), false
     ) on conflict (id) do nothing`,
    [owner],
  );
} else {
  await client.query(
    `insert into auth.users (id, email, is_anonymous) values ($1, 'demo@example.com', false)
     on conflict (id) do nothing`,
    [owner],
  );
}
await client.query(
  `insert into invitations (
     id, owner_id, slug, status, theme, groom_name, groom_given_name, bride_name, bride_given_name,
     ceremony_date, ceremony_time, venue_name, address, greeting, shared_rsvp_token_hash, published_at, published_revision
   ) values (
     $1, $2, $3, 'published', 'ivory', '김신랑', '신랑', '이신부', '신부',
     '2027-06-01', '14:00', '식물관', '서울시 종로구', '데모 초대장입니다.', $4, now(), 1
   )
   on conflict (slug) do nothing`,
  [invitation, owner, slug, tokenHash(shared)],
);
const row = await client.query<{ id: string }>('select id from invitations where slug = $1', [slug]);
const invitationId = row.rows[0]?.id ?? invitation;
await client.query(
  `insert into recipients (id, invitation_id, name, token_hash)
   values ($1, $2, '김하객', $3)
   on conflict (token_hash) do nothing`,
  [recipient, invitationId, tokenHash(personal)],
);
await client.query(
  `update invitations set published_document = $2::jsonb where id = $1 and published_document is null`,
  [
    invitationId,
    JSON.stringify({
      id: invitationId,
      slug,
      theme: 'ivory',
      groom: { name: '김신랑', givenName: '신랑' },
      bride: { name: '이신부', givenName: '신부' },
      ceremony: { date: '2027-06-01', time: '14:00', venueName: '식물관', address: '서울시 종로구' },
      families: {},
      photos: [],
      accounts: [],
      greeting: '데모 초대장입니다.',
      rsvp: { deadline: '2027-05-31T14:59:59.999Z' },
    }),
  ],
);
await client.query('commit');
await client.end();

console.log(JSON.stringify({
  slug,
  invitePath: `/i/${slug}/`,
  personalToken: personal,
  sharedToken: shared,
  note: '토큰 원문은 이 출력에만 있다. DB 에는 해시만 있다.',
}, null, 2));
