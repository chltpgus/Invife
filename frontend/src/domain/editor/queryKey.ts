export const editorQueryKeys = {
  all: ['editor'],
  list: () => [...editorQueryKeys.all, 'list'] as const,
  invitation: (id: string) => [...editorQueryKeys.all, 'invitation', id] as const,
} as const;
