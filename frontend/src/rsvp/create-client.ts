import { env } from '@/env';
import { browserStore, createApiRsvpClient, type RsvpClient } from '@/rsvp/client';
import { createFixtureRsvpClient } from '@/rsvp/fixture-client';

export function createRsvpClient(): RsvpClient {
  if (env.dataSource === 'api') return createApiRsvpClient(env.apiBaseUrl);
  return createFixtureRsvpClient(browserStore());
}
