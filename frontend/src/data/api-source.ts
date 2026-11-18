import { getPublishedInvitation, listPublishedSlugs } from '@/api/guest/query';
import type { GuestDataSource } from '@/data/source';
import { env } from '@/env';

/** 빌드 때 공개 초대장 JSON 만 받는다. */
export function createApiGuestDataSource(baseUrl = env.apiBaseUrl): GuestDataSource {
  return {
    listStaticParams() {
      return listPublishedSlugs(baseUrl);
    },
    getInvitation(slug) {
      return getPublishedInvitation(baseUrl, slug);
    },
  };
}
