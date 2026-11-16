import { invitations } from '@/data/fixtures';
import type { GuestDataSource } from '@/data/source';

export const fixtureSource: GuestDataSource = {
  async listStaticParams() {
    return invitations.map((invitation) => ({ slug: invitation.slug }));
  },
  async getInvitation(slug) {
    return invitations.find((invitation) => invitation.slug === slug) ?? null;
  },
};
