import axios from 'axios';
import type { GuestDataSource, StaticParam } from '@/data/source';
import type { Invitation } from '@/domain/types';
import { env } from '@/env';

/** 빌드 때 공개 초대장 JSON 만 받는다. */
export function createApiGuestDataSource(baseUrl = env.apiBaseUrl): GuestDataSource {
  const http = axios.create({ validateStatus: () => true });
  return {
    async listStaticParams() {
      const response = await http.get<{ slug: string }[]>(`${baseUrl}/v1/invitations`);
      if (response.status >= 400) throw new Error(`static params failed: ${response.status}`);
      return response.data.map((item): StaticParam => ({ slug: item.slug }));
    },
    async getInvitation(slug) {
      const response = await http.get<Invitation>(`${baseUrl}/v1/invitations/${encodeURIComponent(slug)}`);
      if (response.status === 404) return null;
      if (response.status >= 400) throw new Error(`invitation failed: ${response.status}`);
      return response.data;
    },
  };
}
