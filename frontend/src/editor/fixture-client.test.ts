import { describe, expect, it } from 'vitest';
import { createMemoryEditorClient } from '@/editor/fixture-client';
import { planAutosave } from '@/editor/patch';
import { draftFromInvitation } from '@/editor/document';

function tickingClock(): () => Date {
  let step = 0;
  return () => new Date(Date.parse('2026-11-17T00:00:00.000Z') + step++ * 1000);
}

describe('에디터 목 클라이언트', () => {
  it('If-Match 가 없으면 거절하고, 낡은 etag 면 현재 초대장을 돌려준다', async () => {
    const client = createMemoryEditorClient(tickingClock());
    const created = await client.createInvitation({ theme: 'sage', groomName: '김민준', brideName: '이서연', ceremonyDate: '2027-05-15' });
    expect(created.groom.givenName).toBe('');
    expect(created.etag).not.toBe(created.updatedAt);

    const missing = await client.autosave(created.id, { groom: { phone: '010' } }, '');
    expect(missing).toMatchObject({ ok: false, code: 'validation', field: 'if-match' });

    const saved = await client.autosave(created.id, { groom: { phone: '010' }, ceremony: { venueName: '더채플' } }, created.etag);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.invitation.groom.phone).toBe('010');
    expect(saved.invitation.groom.name).toBe('김민준');

    const stale = await client.autosave(created.id, { greeting: '덮기' }, created.etag);
    expect(stale.ok).toBe(false);
    if (!stale.ok && stale.code === 'conflict') {
      expect(stale.invitation.ceremony.venueName).toBe('더채플');
      expect(stale.invitation.etag).toBe(saved.invitation.etag);
    }
  });

  it('사진 자동 저장은 초점·크롭·필터만 바꾸고, 삭제는 DELETE 다', async () => {
    const client = createMemoryEditorClient(tickingClock());
    const created = await client.createInvitation({ theme: 'ivory' });
    const blob = new Blob([Uint8Array.from([1, 2, 3, 4])], { type: 'image/png' });
    const signed = await client.presignPhoto(created.id, { contentType: 'image/png', byteSize: blob.size });
    expect(signed.ok).toBe(true);
    if (!signed.ok) return;
    expect(await client.putPhoto(signed.result, blob)).toBe(true);
    const started = await client.completePhoto(created.id, signed.result.photoId);
    expect(started.ok && started.photo?.status).toBe('processing');
    await new Promise((resolve) => setTimeout(resolve, 80));
    const listed = await client.getPhoto(created.id, signed.result.photoId);
    expect(listed?.photo.status).toBe('ready');
    expect(listed?.photo.src?.w800.startsWith('data:')).toBe(true);
    expect(listed?.etag).toBe(started.ok ? started.etag : '');

    const focalOnly = await client.autosave(created.id, { photos: [{ id: signed.result.photoId, sort: 0, focal: { x: 0.2, y: 0.3 } }] }, listed?.etag ?? '');
    expect(focalOnly.ok).toBe(true);
    if (!focalOnly.ok) return;
    expect(focalOnly.invitation.photos[0]?.status).toBe('ready');
    expect(focalOnly.invitation.photos[0]?.focal).toEqual({ x: 0.2, y: 0.3 });

    const filtered = await client.autosave(
      created.id,
      { photos: [{ id: signed.result.photoId, sort: 0, focal: { x: 0.2, y: 0.3 }, crop: { x: 0, y: 0, width: 0.5, height: 0.5 }, filter: 'mono' }] },
      focalOnly.invitation.etag,
    );
    expect(filtered.ok).toBe(true);
    if (!filtered.ok) return;
    expect(filtered.invitation.photos[0]?.status).toBe('processing');
    expect(filtered.invitation.photos[0]?.src).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 80));
    const ready = await client.getInvitation(created.id);
    expect(ready?.photos[0]?.filter).toBe('mono');
    expect(ready?.photos[0]?.status).toBe('ready');
    expect(ready?.etag).toBe(filtered.invitation.etag);

    const kept = await client.autosave(created.id, { greeting: '안녕' }, ready?.etag ?? '');
    expect(kept.ok && kept.invitation.photos).toHaveLength(1);

    const removed = await client.deletePhoto(created.id, signed.result.photoId);
    expect(removed.ok && removed.invitation?.photos).toHaveLength(0);
  });

  it('미완성 전화번호도 자동 저장 본문에 넣는다', () => {
    const client = createMemoryEditorClient(tickingClock());
    return client.createInvitation({ theme: 'ivory', groomName: '김민준' }).then((created) => {
      const draft = draftFromInvitation(created);
      draft.invitation.groom.phone = '010';
      expect(planAutosave(created, draft)).toMatchObject({ groom: { phone: '010' } });
    });
  });
});
