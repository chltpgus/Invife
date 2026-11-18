import { CanActivate, ExecutionContext, Inject, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { bearer, verifyAccessToken, type AuthClaims } from '../auth/jwt';
import { HttpError } from '../http';
import { APP_DEPS, type AppDeps } from './runtime';

export const PUBLIC_ROUTE = 'invife:public-route';
export const PublicRoute = () => SetMetadata(PUBLIC_ROUTE, true);

export type AuthenticatedRequest = Request & { claims: AuthClaims };

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(APP_DEPS) private readonly deps: AppDeps,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [context.getHandler(), context.getClass()])) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = bearer(request.headers.authorization);
    if (!token || !this.deps.config.jwtSecret) throw new HttpError(401, 'unauthorized');
    try {
      request.claims = await verifyAccessToken(token, this.deps.config.jwtSecret);
      return true;
    } catch {
      throw new HttpError(401, 'unauthorized');
    }
  }
}

export function claims(request: AuthenticatedRequest): AuthClaims {
  return request.claims;
}
