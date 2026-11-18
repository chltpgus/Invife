export const hostQueryKeys = {
  all: ['host'],
  rsvp: (id: string) => [...hostQueryKeys.all, 'rsvp', id] as const,
  notices: () => [...hostQueryKeys.all, 'notices'] as const,
  appSettings: () => [...hostQueryKeys.all, 'app-settings'] as const,
  invitationSettings: (id: string) => [...hostQueryKeys.all, 'invitation-settings', id] as const,
} as const;
