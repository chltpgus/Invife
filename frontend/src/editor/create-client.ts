import { createBrowserEditorClient } from '@/editor/fixture-client';
import type { EditorClient } from '@/editor/client';

export function createEditorClient(): EditorClient {
  return createBrowserEditorClient();
}
