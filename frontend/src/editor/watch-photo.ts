import type { EditorClient } from '@/editor/client';
import type { EditorPhoto } from '@/editor/contract';

const POLL_MS = 1000;
const RETRY_COMPLETE_MS = 60_000;

/** complete 는 202 processing 이다. 1초마다 상태를 보고, 60초가 지나면 complete 를 한 번 더 보낸다. */
export async function waitForPhoto(
  client: EditorClient,
  invitationId: string,
  photoId: string,
  onTick: (etag: string, photo: EditorPhoto) => void,
): Promise<EditorPhoto> {
  const started = Date.now();
  let resent = false;
  for (;;) {
    const loaded = await client.getPhoto(invitationId, photoId);
    if (!loaded) throw new Error('photo missing');
    onTick(loaded.etag, loaded.photo);
    if (loaded.photo.status === 'ready' || loaded.photo.status === 'failed') return loaded.photo;
    if (!resent && Date.now() - started >= RETRY_COMPLETE_MS) {
      resent = true;
      const again = await client.completePhoto(invitationId, photoId);
      if (again.ok && again.photo) onTick(again.etag, again.photo);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}
