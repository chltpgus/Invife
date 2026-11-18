import type { ApiResult, RequestOptions } from '@/api/instance/types';
import { linkKakaoIdentity, signInWithKakao } from '@/api/auth';
import type { EditorClient } from '@/editor/client';
import type {
  AppSettings,
  AppSettingsResult,
  ClaimDraftsResult,
  ClaimTicketResult,
  EditorFailure,
  EditorInvitation,
  EditorSession,
  HostNotice,
  InvitationActionResult,
  InvitationSettings,
  InvitationSettingsResult,
  KakaoLinkResult,
  Recipient,
  RecipientMutationResult,
  RsvpDashboard,
  RsvpDashboardResult,
  StaticRebuild,
} from '@/editor/contract';
import { readEtag, withEtag } from '@/editor/etag';

type Http = {
  get: <T>(url: string, options?: RequestOptions) => Promise<ApiResult<T>>;
  post: <T>(url: string, options?: RequestOptions) => Promise<ApiResult<T>>;
  patch: <T>(url: string, options?: RequestOptions) => Promise<ApiResult<T>>;
  delete: <T>(url: string, options?: RequestOptions) => Promise<ApiResult<T>>;
};

type SettingsBody = {
  settings?: InvitationSettings;
  etag?: string;
  error?: { code?: string; field?: string; reason?: string };
};

type InvitationBody = {
  invitation?: EditorInvitation;
  etag?: string;
  staticRebuild?: StaticRebuild;
  error?: { code?: string; field?: string; reason?: string };
};

type HostSlice = Pick<
  EditorClient,
  | 'session'
  | 'appSettings'
  | 'updateAppSettings'
  | 'linkKakao'
  | 'signInKakao'
  | 'createClaimTicket'
  | 'claimDrafts'
  | 'publish'
  | 'applyChanges'
  | 'unpublish'
  | 'deleteInvitation'
  | 'invitationSettings'
  | 'updateInvitationSettings'
  | 'addRecipients'
  | 'updateRecipient'
  | 'reissueRecipient'
  | 'revokeRecipient'
  | 'rsvpDashboard'
  | 'notices'
>;

export function apiHostMethods(http: Http): HostSlice {
  return {
    async session() {
      const response = await http.get<EditorSession>('/v1/editor/session');
      if (response.status >= 400) throw new Error(`session failed: ${response.status}`);
      return response.data;
    },
    async appSettings() {
      const response = await http.get<AppSettings>('/v1/editor/settings');
      if (response.status >= 400 || !('adsEnabled' in response.data)) return failed(response.status, response.data) as AppSettingsResult;
      return { ok: true, settings: response.data };
    },
    async updateAppSettings(adsEnabled) {
      const response = await http.patch<AppSettings>('/v1/editor/settings', { body: { adsEnabled } });
      if (response.status >= 400 || !('adsEnabled' in response.data)) return failed(response.status, response.data) as AppSettingsResult;
      return { ok: true, settings: response.data };
    },
    linkKakao(redirectTo) {
      return linkKakaoIdentity(redirectTo);
    },
    signInKakao(redirectTo) {
      return signInWithKakao(redirectTo);
    },
    async createClaimTicket(invitationIds) {
      const response = await http.post<ClaimTicketResult & { error?: { code?: string } }>('/v1/editor/claim-tickets', { body: { invitationIds } });
      if (response.status >= 400 || !('ticket' in response.data)) return failed(response.status, response.data);
      return { ok: true, ticket: response.data.ticket, expiresAt: response.data.expiresAt };
    },
    async claimDrafts(ticket) {
      const response = await http.post<ClaimDraftsResult & { error?: { code?: string } }>('/v1/editor/drafts/claim', { body: { ticket } });
      if (response.status >= 400 || !('invitations' in response.data)) return failed(response.status, response.data);
      return { ok: true, invitations: response.data.invitations };
    },
    publish(id) {
      return action(http, `/v1/editor/invitations/${id}/publish`);
    },
    applyChanges(id) {
      return action(http, `/v1/editor/invitations/${id}/apply`);
    },
    unpublish(id) {
      return action(http, `/v1/editor/invitations/${id}/unpublish`);
    },
    async deleteInvitation(id, confirm) {
      const response = await http.delete<{ ok?: boolean; staticRebuild?: StaticRebuild; error?: { code?: string; field?: string; reason?: string } }>('/v1/editor/invitations/{id}', { path: { id }, body: confirm ? { confirm } : {} });
      if (response.status >= 400 || response.data.ok !== true) return failed(response.status, response.data);
      return { ok: true, staticRebuild: response.data.staticRebuild };
    },
    async invitationSettings(id) {
      const response = await http.get<SettingsBody>('/v1/editor/invitations/{id}/settings', { path: { id } });
      return mapSettings(response);
    },
    async updateInvitationSettings(id, body, ifMatch) {
      const response = await http.patch<SettingsBody>('/v1/editor/invitations/{id}/settings', {
        path: { id },
        body,
        headers: { 'If-Match': ifMatch },
      });
      return mapSettings(response);
    },
    addRecipients(id, names) {
      return recipients(http, 'post', `/v1/editor/invitations/${id}/recipients`, { names });
    },
    updateRecipient(id, recipientId, name) {
      return recipients(http, 'patch', `/v1/editor/invitations/${id}/recipients/${recipientId}`, { name });
    },
    reissueRecipient(id, recipientId) {
      return recipients(http, 'post', `/v1/editor/invitations/${id}/recipients/${recipientId}/reissue`, {});
    },
    revokeRecipient(id, recipientId) {
      return recipients(http, 'post', `/v1/editor/invitations/${id}/recipients/${recipientId}/revoke`, {});
    },
    async rsvpDashboard(id) {
      const response = await http.get<RsvpDashboard & { error?: { code?: string; reason?: string } }>('/v1/editor/invitations/{id}/rsvp', { path: { id } });
      if (response.status >= 400 || !response.data.totals) return failed(response.status, response.data) as RsvpDashboardResult;
      return { ok: true, dashboard: response.data };
    },
    async notices() {
      const response = await http.get<{ notices: HostNotice[] }>('/v1/editor/notices');
      if (response.status >= 400) throw new Error(`notices failed: ${response.status}`);
      return response.data.notices;
    },
  };
}

async function action(http: Http, url: string): Promise<InvitationActionResult> {
  const response = await http.post<InvitationBody>(url, { body: {} });
  return mapInvitation(response);
}

async function recipients(http: Http, method: 'post' | 'patch', url: string, body: unknown): Promise<RecipientMutationResult> {
  const response = await http[method]<{ recipients?: Recipient[]; error?: { code?: string; reason?: string } }>(url, { body });
  if (response.status >= 400 || !response.data.recipients) return failed(response.status, response.data);
  return { ok: true, recipients: response.data.recipients };
}

function mapSettings(response: ApiResult<SettingsBody>): InvitationSettingsResult {
  if (response.status >= 400 || !response.data.settings) return failed(response.status, response.data);
  return { ok: true, settings: response.data.settings, etag: readEtag(response.header('etag'), response.data.etag) ?? '' };
}

function mapInvitation(response: ApiResult<InvitationBody>): InvitationActionResult {
  if (response.status >= 400 || !response.data.invitation || !response.data.staticRebuild) return failed(response.status, response.data);
  return {
    ok: true,
    invitation: withEtag(response.data.invitation, readEtag(response.header('etag'), response.data.etag)),
    staticRebuild: response.data.staticRebuild,
  };
}

function failed(status: number, body: unknown): EditorFailure {
  const error = body && typeof body === 'object' && 'error' in body ? body.error as { code?: string; field?: string; reason?: string } | undefined : undefined;
  if (status === 403 && error?.reason === 'login_required') return { ok: false, code: 'login_required', reason: 'login_required' };
  if (status === 403 && error?.code === 'claim_invalid') return { ok: false, code: 'claim_invalid' };
  if (status === 403) return { ok: false, code: 'forbidden', reason: error?.reason };
  if (status === 404) return { ok: false, code: 'not_found' };
  if (status === 409) return { ok: false, code: 'conflict' };
  if (status === 400) return { ok: false, code: 'validation', field: error?.field, reason: error?.reason };
  return { ok: false, code: 'failed' };
}

export type { KakaoLinkResult };
