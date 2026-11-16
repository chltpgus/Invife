import { env } from '@/env';
import type { FixtureRsvpMode } from '@/domain/types';
import { browserStore, createApiRsvpClient, createFixtureRsvpClient, type RsvpClient } from '@/rsvp/client';

export function createRsvpClient(mode: FixtureRsvpMode): RsvpClient {
  if (env.apiBaseUrl) return createApiRsvpClient(env.apiBaseUrl);
  return createFixtureRsvpClient(mode, browserStore());
}
