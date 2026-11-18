import { PHOTO_LIMIT, FULL_CROP } from '@/domain/editor';
import { summarizeInvitation, type EditorClient } from '@/editor/client';
import type { AutosaveBody, AutosaveResult, CreateInvitationBody, EditorInvitation, EditorInvitationSummary, EditorPhoto, PhotoStepResult, PresignBody, PresignResult } from '@/editor/contract';
import { applyAutosave, blankInvitation } from '@/editor/document';
import { etagsMatch, stampUser } from '@/editor/etag';

export type InvitationRepository = {
  list(): Promise<EditorInvitationSummary[]>;
  read(id: string): Promise<EditorInvitation | null>;
  write(invitation: EditorInvitation): Promise<void>;
};

const INDEX_KEY = 'invife:editor:index';
const DB_NAME = 'invife-editor';
const STORE = 'drafts';

export function createMemoryEditorClient(now = () => new Date()): EditorClient {
  const invitations = new Map<string, EditorInvitation>();
  const uploads = new Map<string, { invitationId: string; photoId: string; blob: Blob | null }>();
  return createStoredEditorClient(
    {
      async list() {
        return [...invitations.values()].map(summarizeInvitation).sort(byUpdated);
      },
      async read(id) {
        return invitations.get(id) ?? null;
      },
      async write(invitation) {
        invitations.set(invitation.id, invitation);
      },
    },
    uploads,
    now,
  );
}

export function createBrowserEditorClient(now = () => new Date()): EditorClient {
  const uploads = new Map<string, { invitationId: string; photoId: string; blob: Blob | null }>();
  return createStoredEditorClient(
    {
      async list() {
        return readIndex();
      },
      async read(id) {
        const value = await idbRequest<EditorInvitation | undefined>('readonly', (store) => store.get(id));
        if (!value || value.status === undefined || !value.ceremony) return null;
        return value;
      },
      async write(invitation) {
        await idbRequest('readwrite', (store) => store.put(invitation, invitation.id));
        const index = readIndex().filter((item) => item.id !== invitation.id);
        index.unshift(summarizeInvitation(invitation));
        localStorage.setItem(INDEX_KEY, JSON.stringify(index));
      },
    },
    uploads,
    now,
  );
}

export function createStoredEditorClient(
  repo: InvitationRepository,
  uploads: Map<string, { invitationId: string; photoId: string; blob: Blob | null }>,
  now: () => Date,
): EditorClient {
  let tail = Promise.resolve();
  const exclusive = <T>(task: () => Promise<T>): Promise<T> => {
    const run = tail.then(task, task);
    tail = run.then(() => undefined, () => undefined);
    return run;
  };
  return {
    listInvitations() {
      return repo.list();
    },
    async createInvitation(body: CreateInvitationBody) {
      const invitation = blankInvitation(body, now(), crypto.randomUUID(), newSlug());
      await repo.write(invitation);
      return invitation;
    },
    getInvitation(id) {
      return repo.read(id);
    },
    async autosave(id, body: AutosaveBody, ifMatch): Promise<AutosaveResult> {
      return exclusive(async () => {
      const stored = await repo.read(id);
      if (!stored) return { ok: false, code: 'failed' };
      if (!ifMatch.trim()) return { ok: false, code: 'validation', field: 'if-match' };
      if (!etagsMatch(stored.etag, ifMatch)) return { ok: false, code: 'conflict', invitation: stored };
      const next = applyAutosave(stored, body, now());
      await repo.write(next);
      scheduleReady(repo, uploads, next, exclusive);
      return { ok: true, invitation: next };
      });
    },
    async presignPhoto(invitationId, body: PresignBody) {
      return exclusive(async () => {
      const stored = await repo.read(invitationId);
      if (!stored) return { ok: false as const, message: '사진을 올리지 못했어요' };
      if (stored.photos.length >= PHOTO_LIMIT) return { ok: false as const, message: '사진은 10장까지 올릴 수 있어요' };
      const photoId = crypto.randomUUID();
      const token = crypto.randomUUID();
      const photo: EditorPhoto = {
        id: photoId,
        sort: stored.photos.length,
        status: 'pending',
        width: null,
        height: null,
        focal: { x: 0.5, y: 0.4 },
        crop: { ...FULL_CROP },
        filter: stored.photoFilter,
        lowQuality: false,
        src: null,
        lqip: null,
      };
      const invitation = stampUser({ ...stored, photos: [...stored.photos, photo] }, now());
      uploads.set(token, { invitationId, photoId, blob: null });
      await repo.write(invitation);
      const result: PresignResult = {
        photoId,
        method: 'PUT',
        uploadUrl: `memory:${token}`,
        headers: { 'Content-Type': body.contentType },
        expiresAt: new Date(now().getTime() + 15 * 60 * 1000).toISOString(),
      };
      return { ok: true as const, result, invitation };
      });
    },
    async putPhoto(target, body) {
      const token = target.uploadUrl.startsWith('memory:') ? target.uploadUrl.slice('memory:'.length) : '';
      const slot = uploads.get(token);
      if (!slot) return false;
      slot.blob = body;
      return true;
    },
    async completePhoto(invitationId, photoId): Promise<PhotoStepResult> {
      return exclusive(async () => {
      const stored = await repo.read(invitationId);
      if (!stored) return { ok: false, code: 'failed', message: '사진을 올리지 못했어요' };
      const photo = stored.photos.find((item) => item.id === photoId);
      if (!photo) return { ok: false, code: 'failed', message: '사진을 올리지 못했어요' };
      const slot = [...uploads.values()].find((item) => item.invitationId === invitationId && item.photoId === photoId);
      if (!slot?.blob && photo.status === 'pending') {
        const failed = { ...photo, status: 'failed' as const };
        const invitation = stampUser({ ...stored, photos: stored.photos.map((item) => (item.id === photoId ? failed : item)) }, now());
        await repo.write(invitation);
        return { ok: true, invitation, photo: failed, etag: invitation.etag };
      }
      const processing = { ...photo, status: 'processing' as const };
      const invitation = { ...stored, photos: stored.photos.map((item) => (item.id === photoId ? processing : item)) };
      await repo.write(invitation);
      scheduleReady(repo, uploads, invitation, exclusive);
      return { ok: true, invitation, photo: processing, etag: invitation.etag };
      });
    },
    async getPhotos(invitationId) {
      const stored = await repo.read(invitationId);
      if (!stored) return null;
      return { etag: stored.etag, photos: stored.photos };
    },
    async getPhoto(invitationId, photoId) {
      const stored = await repo.read(invitationId);
      const photo = stored?.photos.find((item) => item.id === photoId);
      if (!stored || !photo) return null;
      return { etag: stored.etag, photo };
    },
    async deletePhoto(invitationId, photoId): Promise<PhotoStepResult> {
      return exclusive(async () => {
      const stored = await repo.read(invitationId);
      if (!stored) return { ok: false, code: 'failed', message: '사진을 지우지 못했어요' };
      const invitation = stampUser(
        { ...stored, photos: stored.photos.filter((photo) => photo.id !== photoId).map((photo, sort) => ({ ...photo, sort })) },
        now(),
      );
      await repo.write(invitation);
      return { ok: true, invitation, etag: invitation.etag };
      });
    },
  };
}

const pendingReady = new Set<string>();

function scheduleReady(
  repo: InvitationRepository,
  uploads: Map<string, { invitationId: string; photoId: string; blob: Blob | null }>,
  invitation: EditorInvitation,
  exclusive: <T>(task: () => Promise<T>) => Promise<T>,
) {
  for (const photo of invitation.photos) {
    if (photo.status !== 'processing') continue;
    const key = `${invitation.id}:${photo.id}`;
    if (pendingReady.has(key)) continue;
    pendingReady.add(key);
    setTimeout(() => {
      pendingReady.delete(key);
      void exclusive(() => settle(repo, uploads, invitation.id, photo.id));
    }, 40);
  }
}

async function settle(
  repo: InvitationRepository,
  uploads: Map<string, { invitationId: string; photoId: string; blob: Blob | null }>,
  invitationId: string,
  photoId: string,
) {
  const current = await repo.read(invitationId);
  const photo = current?.photos.find((item) => item.id === photoId);
  if (!current || !photo || photo.status !== 'processing') return;
  const slot = [...uploads.values()].find((item) => item.invitationId === invitationId && item.photoId === photoId);
  const ready = slot?.blob ? await finishPhoto(photo, slot.blob) : { ...photo, status: 'ready' as const };
  await repo.write({ ...current, photos: current.photos.map((item) => (item.id === photoId ? ready : item)) });
}

async function finishPhoto(photo: EditorPhoto, blob: Blob | null): Promise<EditorPhoto> {
  if (!blob) return { ...photo, status: 'failed' };
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const url = `data:${blob.type || 'image/jpeg'};base64,${bytesToBase64(bytes)}`;
  const size = await measure(blob);
  return {
    ...photo,
    status: 'ready',
    width: size.width,
    height: size.height,
    lowQuality: Math.min(size.width, size.height) < 800,
    src: { w800: url, w1200: url, w1600: url, thumb: url },
    lqip: url,
  };
}

async function measure(blob: Blob): Promise<{ width: number; height: number }> {
  if (typeof createImageBitmap !== 'function') return { width: 1600, height: 1600 };
  try {
    const bitmap = await createImageBitmap(blob);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return { width: 1600, height: 1600 };
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 8192) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  }
  return btoa(binary);
}

function newSlug(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 12);
}

function byUpdated(a: EditorInvitationSummary, b: EditorInvitationSummary): number {
  return a.updatedAt < b.updatedAt ? 1 : -1;
}

function readIndex(): EditorInvitationSummary[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is EditorInvitationSummary => Boolean(item && typeof item === 'object' && 'id' in item && typeof item.id === 'string'));
  } catch {
    return [];
  }
}

function idbRequest<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = run(tx.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
  );
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
