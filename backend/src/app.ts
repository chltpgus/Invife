import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { raw } from 'express';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from './app.module';
import type { AppDeps } from './shared/runtime';

export type { AppDeps } from './shared/runtime';

export async function createApp(deps: AppDeps): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule.register(deps), { logger: false });
  const express = app.getHttpAdapter().getInstance();
  express.disable('x-powered-by');
  express.disable('etag');
  app.use(raw({ type: ['image/*', 'application/octet-stream'], limit: '21mb' }));
  app.enableCors({
    origin(origin: string | undefined, callback: (error: Error | null, allow?: boolean | string) => void) {
      const allowed = !origin || deps.config.corsOrigins.includes(origin);
      callback(null, allowed ? origin ?? true : deps.config.corsOrigins[0] ?? false);
    },
    allowedHeaders: ['Authorization', 'Content-Type', 'If-Match'],
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    exposedHeaders: ['Retry-After'],
  });
  app.enableShutdownHooks();
  await app.init();
  return app;
}
