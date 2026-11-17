import { createApiEditorClient } from '@/editor/api-client';
import type { EditorClient } from '@/editor/client';
import { env } from '@/env';

export function createEditorClient(): EditorClient {
  if (!env.apiBaseUrl) throw new Error('NEXT_PUBLIC_DATA_SOURCE=api 인데 NEXT_PUBLIC_API_BASE_URL 이 없습니다.');
  return createApiEditorClient(env.apiBaseUrl);
}
