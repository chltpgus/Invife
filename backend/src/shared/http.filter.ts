import { ArgumentsHost, BadRequestException, Catch, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { HttpError, errorBody, mapDatabaseError } from '../http';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(thrown: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const parseFailure = thrown instanceof SyntaxError || thrown instanceof BadRequestException;
    const error =
      thrown instanceof HttpError
        ? thrown
        : parseFailure
          ? new HttpError(400, 'validation')
          : mapDatabaseError(thrown) ?? new HttpError(503, 'unavailable');
    if (!(thrown instanceof HttpError) && !parseFailure && !mapDatabaseError(thrown)) {
      console.error(thrown instanceof Error ? thrown.message : 'error');
    }
    const result = errorBody(error);
    if (result.retryAfter !== undefined) response.setHeader('Retry-After', String(result.retryAfter));
    const etag = typeof result.body.etag === 'string' ? result.body.etag : null;
    if (etag) response.setHeader('ETag', `"${etag}"`);
    response.status(result.status).json(result.body);
  }
}
