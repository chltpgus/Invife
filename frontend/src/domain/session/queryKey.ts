export const sessionQueryKeys = {
  all: ['session'],
  current: () => [...sessionQueryKeys.all, 'current'] as const,
} as const;
