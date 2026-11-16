import type { FixtureRsvpMode, InvitationRecord } from '@/domain/types';

export type StaticParam = { slug: string; link: string[] };

export type LoadedRecord = InvitationRecord & { rsvpMode?: FixtureRsvpMode };

/** 샘플 JSON 과 Supabase/API 를 같은 모양으로 바꾼다. */
export interface GuestDataSource {
  listStaticParams(): Promise<StaticParam[]>;
  getRecord(slug: string): Promise<LoadedRecord | null>;
}
