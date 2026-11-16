import { env } from '@/env';
import type { GuestDataSource, StaticParam } from '@/data/source';
import type { LoadedRecord } from '@/data/source';

/**
 * DRAFT. 빌드 때 경로를 만들기 위한 초안 엔드포인트다.
 * 받는 사람 이름이 포함되므로 공개 런타임 API 로 열면 안 된다.
 */
export function createApiGuestDataSource(baseUrl = env.apiBaseUrl): GuestDataSource {
  return {
    async listStaticParams() {
      const response = await fetch(`${baseUrl}/v1/guest/static-params`);
      if (!response.ok) throw new Error(`static params failed: ${response.status}`);
      return (await response.json()) as StaticParam[];
    },
    async getRecord(slug) {
      const response = await fetch(`${baseUrl}/v1/guest/records/${encodeURIComponent(slug)}`);
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`record failed: ${response.status}`);
      return (await response.json()) as LoadedRecord;
    },
  };
}
