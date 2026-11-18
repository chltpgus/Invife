import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Response } from 'express';
import { Observable, tap } from 'rxjs';

@Injectable()
export class EtagInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const response = context.switchToHttp().getResponse<Response>();
    return next.handle().pipe(
      tap((body) => {
        const etag = readEtag(body);
        if (etag) response.setHeader('ETag', `"${etag}"`);
      }),
    );
  }
}

function readEtag(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;
  if (typeof record.etag === 'string') return record.etag;
  const invitation = record.invitation;
  if (!invitation || typeof invitation !== 'object') return null;
  const nested = invitation as Record<string, unknown>;
  if (typeof nested.etag === 'string') return nested.etag;
  if (typeof nested.updatedAt === 'string') return nested.updatedAt;
  return null;
}
