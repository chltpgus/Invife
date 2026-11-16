import { staticParamsFor } from '@/domain/links';
import { fixtures } from '@/data/fixtures';
import type { GuestDataSource } from '@/data/source';

export const fixtureSource: GuestDataSource = {
  async listStaticParams() {
    return fixtures.flatMap((record) => staticParamsFor(record));
  },
  async getRecord(slug) {
    return fixtures.find((record) => record.invitation.slug === slug) ?? null;
  },
};
