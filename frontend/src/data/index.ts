import { createApiGuestDataSource } from '@/data/api-source';
import { fixtureSource } from '@/data/fixture-source';
import type { GuestDataSource } from '@/data/source';
import { env } from '@/env';

export function getGuestDataSource(): GuestDataSource {
  if (env.dataSource === 'api') {
    if (!env.apiBaseUrl) {
      throw new Error('NEXT_PUBLIC_DATA_SOURCE=api 인데 NEXT_PUBLIC_API_BASE_URL 이 없습니다.');
    }
    return createApiGuestDataSource();
  }
  return fixtureSource;
}
