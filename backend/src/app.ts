import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { bearer, verifyAccessToken, type AuthClaims } from './auth/jwt';
import type { Config } from './config';
import type { Database } from './db';
import * as editor from './editor/service';
import * as guest from './guest/service';
import { HttpError, clientIp, mapDatabaseError, sendError } from './http';
import type { ObjectStorage } from './photos/storage';
import { verifyTurnstile } from './turnstile';

export type AppDeps = {
  pool: Database;
  config: Config;
  storage: ObjectStorage;
  now?: () => Date;
  verifyTurnstile?: (token: string, ip: string) => Promise<'ok' | 'failed' | 'unavailable'>;
};

type AppEnv = { Variables: { claims: AuthClaims } };

export function createApp(deps: AppDeps) {
  const app = new Hono<AppEnv>();
  const now = deps.now ?? (() => new Date());
  const guestDeps: guest.GuestDeps = {
    pool: deps.pool,
    config: deps.config,
    now,
    verifyTurnstile:
      deps.verifyTurnstile ??
      ((token, ip) => verifyTurnstile(token, ip, deps.config.turnstileSecret, deps.config.turnstileHostname)),
  };
  const editorDeps: editor.EditorDeps = { pool: deps.pool, config: deps.config, storage: deps.storage, now };

  app.use(
    '*',
    cors({
      origin: (origin) => (deps.config.corsOrigins.includes(origin) ? origin : deps.config.corsOrigins[0] ?? '*'),
      allowHeaders: ['Authorization', 'Content-Type', 'If-Match'],
      allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      exposeHeaders: ['Retry-After'],
    }),
  );

  app.onError((error, c) => {
    if (error instanceof HttpError) return sendError(c, error);
    const mapped = mapDatabaseError(error);
    if (mapped) return sendError(c, mapped);
    console.error(error instanceof Error ? error.message : 'error');
    return sendError(c, new HttpError(503, 'unavailable'));
  });

  app.post('/functions/v1/rsvp-context', async (c) => {
    const context = await guest.rsvpContext(guestDeps, await readJson(c), clientIp(c.req.header('x-forwarded-for')));
    c.header('Cache-Control', 'no-store');
    return c.json(context);
  });

  app.post('/functions/v1/rsvp', async (c) => {
    const result = await guest.submitRsvp(guestDeps, await readJson(c), clientIp(c.req.header('x-forwarded-for')));
    c.header('Cache-Control', 'no-store');
    return c.json(result);
  });

  app.get('/v1/invitations', async (c) => {
    const slugs = await editor.listPublicSlugs(deps.pool);
    c.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=86400');
    return c.json(slugs);
  });

  app.get('/v1/invitations/:slug', async (c) => {
    const invitation = await editor.getPublicInvitation(deps.pool, c.req.param('slug'));
    c.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=86400');
    return c.json(invitation);
  });

  app.use('/v1/editor/*', async (c, next) => {
    if (c.req.path.startsWith('/v1/editor/uploads/')) return next();
    const token = bearer(c.req.header('authorization'));
    if (!token || !deps.config.jwtSecret) throw new HttpError(401, 'unauthorized');
    try {
      c.set('claims', await verifyAccessToken(token, deps.config.jwtSecret));
    } catch {
      throw new HttpError(401, 'unauthorized');
    }
    await next();
  });

  app.get('/v1/editor/session', async (c) => c.json(await editor.session(editorDeps, claims(c))));
  app.get('/v1/editor/notices', async (c) => c.json(await editor.listNotices(editorDeps, claims(c))));
  app.get('/v1/editor/invitations', async (c) => c.json(await editor.listInvitations(editorDeps, claims(c))));
  app.post('/v1/editor/invitations', async (c) =>
    c.json(await editor.createInvitation(editorDeps, claims(c), await readJson(c), clientIp(c.req.header('x-forwarded-for'))), 201),
  );
  app.get('/v1/editor/invitations/:id', async (c) => c.json(await editor.getInvitation(editorDeps, claims(c), c.req.param('id'))));
  app.patch('/v1/editor/invitations/:id', async (c) =>
    c.json(await editor.autosave(editorDeps, claims(c), c.req.param('id'), await readJson(c), c.req.header('if-match'))),
  );
  app.post('/v1/editor/invitations/:id/publish', async (c) => c.json(await editor.publish(editorDeps, claims(c), c.req.param('id'))));
  app.post('/v1/editor/invitations/:id/apply', async (c) => c.json(await editor.applyChanges(editorDeps, claims(c), c.req.param('id'))));
  app.post('/v1/editor/invitations/:id/unpublish', async (c) => c.json(await editor.unpublish(editorDeps, claims(c), c.req.param('id'))));
  app.delete('/v1/editor/invitations/:id', async (c) =>
    c.json(await editor.removeInvitation(editorDeps, claims(c), c.req.param('id'), await readJson(c))),
  );
  app.post('/v1/editor/invitations/:id/photos/presign', async (c) =>
    c.json(await editor.presignPhoto(editorDeps, claims(c), c.req.param('id'), await readJson(c)), 201),
  );
  app.post('/v1/editor/invitations/:id/photos/:photoId/complete', async (c) =>
    c.json(await editor.completePhoto(editorDeps, claims(c), c.req.param('id'), c.req.param('photoId'))),
  );
  app.delete('/v1/editor/invitations/:id/photos/:photoId', async (c) => {
    await editor.deletePhoto(editorDeps, claims(c), c.req.param('id'), c.req.param('photoId'));
    return c.body(null, 204);
  });
  app.get('/v1/editor/invitations/:id/rsvp', async (c) => c.json(await editor.rsvpDashboard(editorDeps, claims(c), c.req.param('id'))));
  app.post('/v1/editor/invitations/:id/recipients', async (c) =>
    c.json(await editor.addRecipients(editorDeps, claims(c), c.req.param('id'), await readJson(c)), 201),
  );
  app.patch('/v1/editor/invitations/:id/recipients/:recipientId', async (c) =>
    c.json(await editor.renameRecipient(editorDeps, claims(c), c.req.param('id'), c.req.param('recipientId'), await readJson(c))),
  );
  app.post('/v1/editor/invitations/:id/recipients/:recipientId/revoke', async (c) =>
    c.json(await editor.revokeRecipient(editorDeps, claims(c), c.req.param('id'), c.req.param('recipientId'))),
  );
  app.post('/v1/editor/invitations/:id/recipients/:recipientId/reissue', async (c) =>
    c.json(await editor.reissueRecipient(editorDeps, claims(c), c.req.param('id'), c.req.param('recipientId'))),
  );
  app.post('/v1/editor/claim-tickets', async (c) =>
    c.json(await editor.issueClaim(editorDeps, claims(c), await readJson(c)), 201),
  );
  app.post('/v1/editor/drafts/claim', async (c) => c.json(await editor.claimDrafts(editorDeps, claims(c), await readJson(c))));

  app.put('/v1/editor/uploads/:token', async (c) => {
    const bytes = Buffer.from(await c.req.arrayBuffer());
    await editor.saveUpload(editorDeps, c.req.param('token'), bytes, c.req.header('content-type'));
    return c.body(null, 204);
  });

  return app;
}

function claims(c: Context<AppEnv>): AuthClaims {
  return c.get('claims');
}

async function readJson(c: { req: { text: () => Promise<string> } }): Promise<unknown> {
  const text = await c.req.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HttpError(400, 'validation');
  }
}
