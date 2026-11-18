import { clientInstance } from '@/api/clientInstance';
import type { ApiResult } from '@/api/instance/types';
import type { EditorClient } from '@/editor/client';
import type { AutosaveResult, PhotoStepResult } from '@/editor/contract';
import { readEtag, withEtag } from '@/editor/etag';
import type { EditorDomain } from '@/domain/editor/api.type';

/**
 * `{API_BASE}/v1/editor/invitations`. 공유 clientInstance 가 api 모드에서 익명 Bearer 를 붙인다.
 * 자동 저장은 PATCH 와 `If-Match`. 카카오 연결은 하지 않는다.
 */
export function createApiEditorClient(): EditorClient {
  const http = clientInstance;

  return {
    async listInvitations() {
      const response = await http.get<EditorDomain.ListInvitations.Res>('/v1/editor/invitations');
      if (response.status >= 400) throw new Error(`invitations failed: ${response.status}`);
      return response.data.invitations;
    },
    async createInvitation(body) {
      const response = await http.post<EditorDomain.InvitationBody.Res>('/v1/editor/invitations', { body });
      if (response.status >= 400 || !response.data.invitation) throw new Error(`create invitation failed: ${response.status}`);
      return withEtag(response.data.invitation, readEtag(response.header('etag'), response.data.etag));
    },
    async getInvitation(id) {
      const response = await http.get<EditorDomain.InvitationBody.Res>('/v1/editor/invitations/{id}', { path: { id } });
      if (response.status === 404) return null;
      if (response.status >= 400 || !response.data.invitation) throw new Error(`invitation failed: ${response.status}`);
      return withEtag(response.data.invitation, readEtag(response.header('etag'), response.data.etag));
    },
    async autosave(id, body, ifMatch): Promise<AutosaveResult> {
      const response = await http.patch<EditorDomain.Autosave.Res>('/v1/editor/invitations/{id}', {
        path: { id },
        body,
        headers: { 'If-Match': ifMatch },
      });
      return mapAutosave(response);
    },
    async presignPhoto(invitationId, body) {
      const response = await http.post<EditorDomain.Presign.Res>('/v1/editor/invitations/{id}/photos/presign', {
        path: { id: invitationId },
        body,
      });
      if (response.status >= 400 || !response.data.photoId) return { ok: false, message: '사진을 올리지 못했어요' };
      const loaded = await http.get<EditorDomain.InvitationBody.Res>('/v1/editor/invitations/{id}', { path: { id: invitationId } });
      if (loaded.status >= 400 || !loaded.data.invitation) return { ok: false, message: '사진을 올리지 못했어요' };
      return { ok: true, result: response.data, invitation: withEtag(loaded.data.invitation, readEtag(loaded.header('etag'), loaded.data.etag)) };
    },
    async putPhoto(target, body) {
      const uploaded = await http.put<unknown>(target.uploadUrl, { body, headers: target.headers, skipAuth: true, timeout: 0 });
      return uploaded.status < 400;
    },
    async completePhoto(invitationId, photoId): Promise<PhotoStepResult> {
      const response = await http.post<EditorDomain.PhotoBody.Res>('/v1/editor/invitations/{id}/photos/{photoId}/complete', {
        path: { id: invitationId, photoId },
        body: {},
      });
      if ((response.status !== 202 && response.status !== 200) || !response.data.photo) {
        return { ok: false, code: 'failed', message: '사진을 열지 못했어요' };
      }
      const etag = readEtag(response.header('etag'), response.data.etag) ?? '';
      return { ok: true, photo: response.data.photo, etag };
    },
    async getPhotos(invitationId) {
      const response = await http.get<EditorDomain.PhotosBody.Res>('/v1/editor/invitations/{id}/photos', { path: { id: invitationId } });
      if (response.status === 404) return null;
      if (response.status >= 400 || !response.data.photos) throw new Error(`photos failed: ${response.status}`);
      return { etag: readEtag(response.header('etag'), response.data.etag) ?? '', photos: response.data.photos };
    },
    async getPhoto(invitationId, photoId) {
      const response = await http.get<EditorDomain.PhotoBody.Res>('/v1/editor/invitations/{id}/photos/{photoId}', {
        path: { id: invitationId, photoId },
      });
      if (response.status === 404 || !response.data.photo) return null;
      if (response.status >= 400) throw new Error(`photo failed: ${response.status}`);
      return { etag: readEtag(response.header('etag'), response.data.etag) ?? '', photo: response.data.photo };
    },
    async deletePhoto(invitationId, photoId): Promise<PhotoStepResult> {
      const response = await http.delete('/v1/editor/invitations/{id}/photos/{photoId}', { path: { id: invitationId, photoId } });
      if (response.status >= 400) return { ok: false, code: 'failed', message: '사진을 지우지 못했어요' };
      const loaded = await http.get<EditorDomain.InvitationBody.Res>('/v1/editor/invitations/{id}', { path: { id: invitationId } });
      if (loaded.status >= 400 || !loaded.data.invitation) return { ok: false, code: 'failed', message: '사진을 지우지 못했어요' };
      const invitation = withEtag(loaded.data.invitation, readEtag(loaded.header('etag'), loaded.data.etag));
      return { ok: true, invitation, etag: invitation.etag };
    },
  };
}

function mapAutosave(response: ApiResult<EditorDomain.Autosave.Res>): AutosaveResult {
  const etag = readEtag(response.header('etag'), response.data.etag ?? response.data.invitation?.etag);
  if (response.status === 400 && response.data.error?.field === 'if-match') return { ok: false, code: 'validation', field: 'if-match' };
  if (response.status === 409 && response.data.invitation) {
    return { ok: false, code: 'conflict', invitation: withEtag(response.data.invitation, etag) };
  }
  if (response.status >= 400 || !response.data.invitation) return { ok: false, code: 'failed' };
  return { ok: true, invitation: withEtag(response.data.invitation, etag) };
}
