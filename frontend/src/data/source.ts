import type { Invitation } from '@/domain/types';

export type StaticParam = { slug: string };

/** 빌드가 보는 공개 초대장. 토큰과 받는 사람 이름은 여기 없다. */
export interface GuestDataSource {
  listStaticParams(): Promise<StaticParam[]>;
  getInvitation(slug: string): Promise<Invitation | null>;
}
