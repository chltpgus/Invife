export const invitationQueryKeys = {
  all: ['invitation'],
  list: () => [...invitationQueryKeys.all, 'list'] as const,
  detail: (slug: string) => [...invitationQueryKeys.all, 'detail', slug] as const,
} as const;
