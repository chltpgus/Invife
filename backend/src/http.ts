export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly details: {
      field?: string;
      reason?: string;
      retryAfter?: number;
      invitation?: unknown;
    } = {},
  ) {
    super(code);
  }
}

type PgLike = { code?: string; message?: string };

function asPg(error: unknown): PgLike | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  return error as PgLike;
}

export function mapDatabaseError(error: unknown): HttpError | null {
  const pgError = asPg(error);
  if (!pgError?.code || !/^[0-9A-Z]{5}$/.test(pgError.code)) {
    const text = `${pgError?.code ?? ''} ${error instanceof Error ? error.message : ''}`;
    if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET|timeout|Connection terminated/i.test(text)) {
      return new HttpError(503, 'unavailable');
    }
    return null;
  }
  if (pgError.code === '42501') {
    return new HttpError(403, 'forbidden', { reason: messageOf(pgError) });
  }
  if (pgError.code === 'P0002') return new HttpError(404, 'not_found');
  if (pgError.code === '28000') return new HttpError(403, 'claim_invalid');
  if (pgError.code === '23514') {
    const message = messageOf(pgError);
    if (message.includes('.')) return new HttpError(400, 'validation', { field: message, reason: 'required' });
    return new HttpError(400, 'validation', { reason: message });
  }
  if (['08000', '08001', '08003', '08006', '57P01', '53300'].includes(pgError.code)) {
    return new HttpError(503, 'unavailable');
  }
  return null;
}

function messageOf(error: PgLike): string {
  return (error.message ?? '').split('\n')[0] ?? '';
}

export function errorBody(error: HttpError): { status: number; body: Record<string, unknown>; retryAfter?: number } {
  const payload: Record<string, unknown> = { code: error.code };
  if (error.details.field) payload.field = error.details.field;
  if (error.details.reason) payload.reason = error.details.reason;
  if (error.details.retryAfter !== undefined) payload.retryAfter = error.details.retryAfter;
  const body: Record<string, unknown> = { error: payload };
  if (error.details.invitation) body.invitation = error.details.invitation;
  const etag = etagFrom(body);
  if (etag) body.etag = etag;
  return { status: error.status, body, retryAfter: error.details.retryAfter };
}

function etagFrom(body: Record<string, unknown>): string | null {
  if (typeof body.etag === 'string') return body.etag;
  const invitation = body.invitation;
  if (!invitation || typeof invitation !== 'object') return null;
  const record = invitation as Record<string, unknown>;
  if (typeof record.etag === 'string') return record.etag;
  if (typeof record.updatedAt === 'string') return record.updatedAt;
  return null;
}

export function clientIp(header: string | undefined): string {
  const first = header?.split(',')[0]?.trim();
  return first || '0.0.0.0';
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
