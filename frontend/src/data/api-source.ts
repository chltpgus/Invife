import type { GuestDataSource, StaticParam } from '@/data/source';
import type { Invitation } from '@/domain/types';
import { env } from '@/env';

/** 빌드 때 공개 초대장 JSON 만 받는다. */
export function createApiGuestDataSource(baseUrl = env.apiBaseUrl): GuestDataSource {
  return {
    async listStaticParams() {
      const response = await fetch(`${baseUrl}/v1/invitations`);
      if (!response.ok) throw new Error(`static params failed: ${response.status}`);
      const body = (await response.json()) as { slug: string }[];
      return body.map((item): StaticParam => ({ slug: item.slug }));
    },
    async getInvitation(slug) {
      const response = await fetch(`${baseUrl}/v1/invitations/${encodeURIComponent(slug)}`);
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`invitation failed: ${response.status}`);
      return (await response.json()) as Invitation;
    },
  };
}
