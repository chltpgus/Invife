import { clientInstance } from '@/api/clientInstance';
import type { GuestDataSource, StaticParam } from '@/data/source';
import type { InvitationDomain } from '@/domain/invitation/api.type';
import type { Invitation } from '@/domain/types';

/** 빌드 때 공개 초대장 JSON 만 받는다. 공유 clientInstance 를 쓴다. */
export function createApiGuestDataSource(): GuestDataSource {
  return {
    async listStaticParams() {
      const response = await clientInstance.get<InvitationDomain.List.Res>('/v1/invitations');
      if (response.status >= 400) throw new Error(`static params failed: ${response.status}`);
      return response.data.map((item): StaticParam => ({ slug: item.slug }));
    },
    async getInvitation(slug) {
      const response = await clientInstance.get<Invitation>('/v1/invitations/{slug}', { path: { slug } });
      if (response.status === 404) return null;
      if (response.status >= 400) throw new Error(`invitation failed: ${response.status}`);
      return response.data;
    },
  };
}
