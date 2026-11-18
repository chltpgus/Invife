export const rsvpQueryKeys = {
  all: ['rsvp'],
  context: (slug: string, token: string | null) => [...rsvpQueryKeys.all, 'context', slug, token] as const,
} as const;
