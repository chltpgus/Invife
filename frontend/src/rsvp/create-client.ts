import { env } from '@/env';
import { browserStore, createApiRsvpClient, createFixtureRsvpClient, type RsvpClient } from '@/rsvp/client';

export function createRsvpClient(): RsvpClient {
  if (env.dataSource === 'api') return createApiRsvpClient(env.apiBaseUrl);
  return createFixtureRsvpClient(browserStore());
}
