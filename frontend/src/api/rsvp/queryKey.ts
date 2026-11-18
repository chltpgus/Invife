export const rsvpQueryKeys = {
  all: ['rsvp'] as const,
  context: (slug: string, token: string | undefined) => ['rsvp-context', slug, token ?? null] as const,
};
