import axios, { type AxiosInstance, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { EditorClient } from '@/editor/client';
import type { AutosaveResult, EditorInvitation, EditorInvitationSummary, EditorPhoto, PhotoStepResult, PresignResult } from '@/editor/contract';
import { readEtag, withEtag } from '@/editor/etag';
import { env } from '@/env';

const http: AxiosInstance = axios.create({
  validateStatus: () => true,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

const uploadHttp: AxiosInstance = axios.create({ validateStatus: () => true });

let supabase: SupabaseClient | null = null;
let signingIn: Promise<string | null> | null = null;

function supabaseClient(): SupabaseClient | null {
  if (!env.supabaseUrl || !env.supabaseAnonKey) return null;
  supabase ??= createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return supabase;
}

/** 익명 세션의 access_token. 없거나 만료면 Supabase가 갱신하거나 새로 로그인한다. */
export async function editorAccessToken(): Promise<string | null> {
  const client = supabaseClient();
  if (!client) return null;
  if (!signingIn) {
    signingIn = client.auth.getSession().then(async (existing) => {
      if (existing.data.session?.access_token) return existing.data.session.access_token;
      const signed = await client.auth.signInAnonymously();
      if (signed.error || !signed.data.session) throw new Error('anonymous sign-in failed');
      return signed.data.session.access_token;
    }).finally(() => {
      signingIn = null;
    });
  }
  return signingIn;
}

const wired = new WeakSet<AxiosInstance>();

function wireAuth(client: AxiosInstance, accessToken?: () => string | null) {
  if (wired.has(client)) return;
  wired.add(client);
  client.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
    const token = accessToken ? accessToken() : await editorAccessToken();
    if (token) config.headers.set('Authorization', `Bearer ${token}`);
    return config;
  });
}

type InvitationResponse = { invitation?: EditorInvitation; etag?: string };
type ConflictResponse = { error?: { code?: string; field?: string }; invitation?: EditorInvitation; etag?: string };

/**
 * `{API_BASE}/v1/editor/invitations`. 요청마다 인터셉터가 익명 세션 access_token 을 Bearer 로 넣는다.
 * 자동 저장은 PATCH 와 `If-Match`. 카카오 연결은 하지 않는다.
 */
export function createApiEditorClient(baseUrl: string, options?: { client?: AxiosInstance; accessToken?: () => string | null }): EditorClient {
  const client = options?.client ?? http;
  wireAuth(client, options?.accessToken);
  const root = baseUrl.replace(/\/$/, '');

  return {
    async listInvitations() {
      const response = await client.get<{ invitations: EditorInvitationSummary[] }>(`${root}/v1/editor/invitations`);
      if (response.status >= 400) throw new Error(`invitations failed: ${response.status}`);
      return response.data.invitations;
    },
    async createInvitation(body) {
      const response = await client.post<InvitationResponse>(`${root}/v1/editor/invitations`, body);
      if (response.status >= 400 || !response.data.invitation) throw new Error(`create invitation failed: ${response.status}`);
      return withEtag(response.data.invitation, readEtag(header(response), response.data.etag));
    },
    async getInvitation(id) {
      const response = await client.get<InvitationResponse>(`${root}/v1/editor/invitations/${encodeURIComponent(id)}`);
      if (response.status === 404) return null;
      if (response.status >= 400 || !response.data.invitation) throw new Error(`invitation failed: ${response.status}`);
      return withEtag(response.data.invitation, readEtag(header(response), response.data.etag));
    },
    async autosave(id, body, ifMatch): Promise<AutosaveResult> {
      const response = await client.patch<InvitationResponse & ConflictResponse>(`${root}/v1/editor/invitations/${encodeURIComponent(id)}`, body, {
        headers: { 'If-Match': ifMatch },
      });
      const etag = readEtag(header(response), response.data.etag ?? response.data.invitation?.etag);
      if (response.status === 400 && response.data.error?.field === 'if-match') return { ok: false, code: 'validation', field: 'if-match' };
      if (response.status === 409 && response.data.invitation) {
        return { ok: false, code: 'conflict', invitation: withEtag(response.data.invitation, etag) };
      }
      if (response.status >= 400 || !response.data.invitation) return { ok: false, code: 'failed' };
      return { ok: true, invitation: withEtag(response.data.invitation, etag) };
    },
    async presignPhoto(invitationId, body) {
      const response = await client.post<PresignResult>(`${root}/v1/editor/invitations/${encodeURIComponent(invitationId)}/photos/presign`, body);
      if (response.status >= 400 || !response.data.photoId) return { ok: false, message: '사진을 올리지 못했어요' };
      const loaded = await client.get<InvitationResponse>(`${root}/v1/editor/invitations/${encodeURIComponent(invitationId)}`);
      if (loaded.status >= 400 || !loaded.data.invitation) return { ok: false, message: '사진을 올리지 못했어요' };
      return { ok: true, result: response.data, invitation: withEtag(loaded.data.invitation, readEtag(header(loaded), loaded.data.etag)) };
    },
    async putPhoto(target, body) {
      const response = await uploadHttp.put(target.uploadUrl, body, { headers: target.headers });
      return response.status < 400;
    },
    async completePhoto(invitationId, photoId): Promise<PhotoStepResult> {
      const response = await client.post<{ photo?: EditorPhoto; etag?: string }>(
        `${root}/v1/editor/invitations/${encodeURIComponent(invitationId)}/photos/${encodeURIComponent(photoId)}/complete`,
        {},
      );
      if ((response.status !== 202 && response.status !== 200) || !response.data.photo) {
        return { ok: false, code: 'failed', message: '사진을 열지 못했어요' };
      }
      const etag = readEtag(header(response), response.data.etag) ?? '';
      return { ok: true, photo: response.data.photo, etag };
    },
    async getPhotos(invitationId) {
      const response = await client.get<{ etag?: string; photos?: EditorPhoto[] }>(`${root}/v1/editor/invitations/${encodeURIComponent(invitationId)}/photos`);
      if (response.status === 404) return null;
      if (response.status >= 400 || !response.data.photos) throw new Error(`photos failed: ${response.status}`);
      return { etag: readEtag(header(response), response.data.etag) ?? '', photos: response.data.photos };
    },
    async getPhoto(invitationId, photoId) {
      const response = await client.get<{ etag?: string; photo?: EditorPhoto }>(
        `${root}/v1/editor/invitations/${encodeURIComponent(invitationId)}/photos/${encodeURIComponent(photoId)}`,
      );
      if (response.status === 404 || !response.data.photo) return null;
      if (response.status >= 400) throw new Error(`photo failed: ${response.status}`);
      return { etag: readEtag(header(response), response.data.etag) ?? '', photo: response.data.photo };
    },
    async deletePhoto(invitationId, photoId): Promise<PhotoStepResult> {
      const response = await client.delete(`${root}/v1/editor/invitations/${encodeURIComponent(invitationId)}/photos/${encodeURIComponent(photoId)}`);
      if (response.status >= 400) return { ok: false, code: 'failed', message: '사진을 지우지 못했어요' };
      const loaded = await client.get<InvitationResponse>(`${root}/v1/editor/invitations/${encodeURIComponent(invitationId)}`);
      if (loaded.status >= 400 || !loaded.data.invitation) return { ok: false, code: 'failed', message: '사진을 지우지 못했어요' };
      const invitation = withEtag(loaded.data.invitation, readEtag(header(loaded), loaded.data.etag));
      return { ok: true, invitation, etag: invitation.etag };
    },
  };
}

function header(response: AxiosResponse): string | undefined {
  const value = response.headers?.etag ?? response.headers?.ETag;
  if (Array.isArray(value)) return value[0];
  return typeof value === 'string' ? value : undefined;
}
