import { apiClient } from '@/api/createInstance';
import type { StaticParam } from '@/data/source';
import type { Invitation } from '@/domain/types';

export async function listPublishedSlugs(baseUrl: string): Promise<StaticParam[]> {
  const response = await apiClient.get<{ slug: string }[]>(`${baseUrl}/v1/invitations`);
  if (response.status >= 400) throw new Error(`static params failed: ${response.status}`);
  return response.data.map((item): StaticParam => ({ slug: item.slug }));
}

export async function getPublishedInvitation(baseUrl: string, slug: string): Promise<Invitation | null> {
  const response = await apiClient.get<Invitation>(`${baseUrl}/v1/invitations/${encodeURIComponent(slug)}`);
  if (response.status === 404) return null;
  if (response.status >= 400) throw new Error(`invitation failed: ${response.status}`);
  return response.data;
}
