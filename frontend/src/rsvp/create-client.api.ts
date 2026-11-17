import { env } from '@/env';
import { createApiRsvpClient, type RsvpClient } from '@/rsvp/client';

/** api 빌드가 이 파일을 쓰면 샘플 이름·토큰은 페이지 번들에 없다. */
export function createRsvpClient(): RsvpClient {
  return createApiRsvpClient(env.apiBaseUrl);
}
