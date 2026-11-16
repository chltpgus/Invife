import { siteConfig } from '@/config';
import type { GuestLink, GuestView, InvitationRecord } from '@/domain/types';

export function parseLink(parts: string[] | undefined): GuestLink | null {
  if (!parts || parts.length === 0) return { type: 'shared-invitation' };
  const [kind, token] = parts;
  if (!token || parts.length !== 2) return null;
  if (kind === 'g') return { type: 'personal', token };
  if (kind === 's') return { type: 'shared-rsvp', token };
  return null;
}

export function guestPath(slug: string, link: GuestLink = { type: 'shared-invitation' }): string {
  if (link.type === 'personal') return `/i/${slug}/g/${encodeURIComponent(link.token)}/`;
  if (link.type === 'shared-rsvp') return `/i/${slug}/s/${encodeURIComponent(link.token)}/`;
  return `/i/${slug}/`;
}

export function resolveGuestView(record: InvitationRecord, link: GuestLink): GuestView | null {
  if (link.type === 'shared-invitation') {
    if (siteConfig.sharedInvitationRsvp === 'inline-form') {
      return {
        kind: 'shared-invitation',
        rsvp: 'inline-form',
        sharedRsvpToken: record.sharedRsvpToken,
      };
    }
    return { kind: 'shared-invitation', rsvp: 'notice' };
  }
  if (link.type === 'shared-rsvp') {
    if (link.token !== record.sharedRsvpToken) return null;
    return { kind: 'shared-rsvp', token: link.token };
  }
  const recipient = record.recipients.find((item) => item.token === link.token);
  if (!recipient) return null;
  if (recipient.revoked) return { kind: 'revoked-personal', token: recipient.token };
  return {
    kind: 'personal',
    token: recipient.token,
    name: recipient.name,
    response: recipient.response,
  };
}

export function staticParamsFor(record: InvitationRecord): Array<{ slug: string; link: string[] }> {
  const slug = record.invitation.slug;
  return [
    { slug, link: [] },
    { slug, link: ['s', record.sharedRsvpToken] },
    ...record.recipients.map((recipient) => ({ slug, link: ['g', recipient.token] })),
  ];
}
