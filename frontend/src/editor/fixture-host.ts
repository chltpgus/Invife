import { publishIssues, fieldIssues } from '@/domain/editor';
import type { EditorClient } from '@/editor/client';
import type { EditorInvitation, EditorInvitationSummary } from '@/editor/contract';
import { draftFromInvitation } from '@/editor/document';
import { etagsMatch, stampUser } from '@/editor/etag';
import {
  appSettingsFrom,
  buildNotices,
  buildRsvpDashboard,
  canEdit,
  freshHost,
  invitationSettingsFrom,
  linkKakaoAccount,
  newToken,
  nextRebuild,
  normalizeRecipientName,
  parseRecipientPaste,
  purgeAtFor,
  rsvpCounts,
  sessionWithAds,
  settingsPatchError,
  signInKakaoAccount,
  toRecipient,
  type HostPersistence,
  type HostState,
  type RecipientRecord,
} from '@/editor/host';

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

type InvitationRepository = {
  list(): Promise<EditorInvitationSummary[]>;
  read(id: string): Promise<EditorInvitation | null>;
  write(invitation: EditorInvitation): Promise<void>;
};

export function fixtureHostMethods(
  repo: InvitationRepository,
  host: HostPersistence,
  now: () => Date,
  exclusive: <T>(task: () => Promise<T>) => Promise<T>,
): HostSlice {
  async function owned(id: string): Promise<{ state: HostState; invitation: EditorInvitation } | null> {
    const invitation = await repo.read(id);
    const state = host.load();
    if (!invitation || invitation.status === 'deleted' || !canEdit(state, id)) return null;
    return { state, invitation };
  }

  return {
    async session() {
      return host.load().session;
    },
    async appSettings() {
      return { ok: true as const, settings: appSettingsFrom(host.load()) };
    },
    async updateAppSettings(adsEnabled) {
      const state = host.load();
      if (!state.session.isAdmin) return { ok: false as const, code: 'forbidden' as const, reason: 'admin_required' };
      const next = { ...state, adsEnabled, session: sessionWithAds(state.session, adsEnabled) };
      host.save(next);
      return { ok: true as const, settings: appSettingsFrom(next) };
    },
    async linkKakao() {
      const current = host.load();
      const linked = linkKakaoAccount(current);
      if (!linked.linked) return { ok: false as const, code: 'existing_account' as const, message: 'Identity is already linked to another user' };
      host.save(linked.state);
      return { ok: true as const, mode: 'linked' as const, redirected: false };
    },
    async signInKakao() {
      host.save(signInKakaoAccount(host.load()));
      return { ok: true, mode: 'linked', redirected: false };
    },
    async createClaimTicket(invitationIds) {
      return exclusive(async () => {
        const state = host.load();
        if (!state.session.isAnonymous) return { ok: false as const, code: 'forbidden' as const, reason: 'not_anonymous' };
        if (invitationIds.length === 0 || invitationIds.some((id) => !canEdit(state, id))) return { ok: false as const, code: 'forbidden' as const };
        const ticket = newToken() + newToken();
        const expiresAt = new Date(now().getTime() + 15 * 60 * 1000).toISOString();
        host.save({ ...state, tickets: { ...state.tickets, [ticket]: { invitationIds, expiresAt, used: false } } });
        return { ok: true as const, ticket, expiresAt };
      });
    },
    async claimDrafts(ticket) {
      return exclusive(async () => {
        const state = host.load();
        if (state.session.isAnonymous) return { ok: false as const, code: 'forbidden' as const, reason: 'login_required' };
        const found = state.tickets[ticket];
        if (!found || found.used || new Date(found.expiresAt).getTime() <= now().getTime()) {
          return { ok: false as const, code: 'claim_invalid' as const };
        }
        const owners = { ...state.owners };
        const invitations = [];
        for (const id of found.invitationIds) {
          const invitation = await repo.read(id);
          if (!invitation) continue;
          owners[id] = state.session.userId;
          invitations.push({ id, slug: invitation.slug });
        }
        host.save({ ...state, owners, tickets: { ...state.tickets, [ticket]: { ...found, used: true } } });
        return { ok: true as const, invitations };
      });
    },
    async publish(id) {
      return exclusive(() => changeInvitation(id, 'publish', (invitation) => {
        if (invitation.status === 'published') return { ok: false, code: 'validation', message: '이미 발행된 청첩장이에요' };
        const issues = publishIssues(fieldIssues(draftFromInvitation(invitation), now()));
        const first = issues[0];
        if (first) return { ok: false, code: 'validation', field: first.id, message: first.message };
        const token = invitation.links.rsvpLinkPath?.split('/').filter(Boolean).at(-1) || newToken();
        return {
          ok: true,
          invitation: stampUser(
            {
              ...invitation,
              status: 'published',
              links: { invitePath: `/i/${invitation.slug}/`, rsvpLinkPath: `/i/${invitation.slug}/s/${token}/` },
              hasUnpublishedChanges: false,
              purgeAt: purgeAtFor(invitation.ceremony.date),
              publishedAt: invitation.publishedAt ?? now().toISOString(),
            },
            now(),
          ),
        };
      }));
    },
    async applyChanges(id) {
      return exclusive(() => changeInvitation(id, 'apply', (invitation) => {
        if (invitation.status !== 'published') return { ok: false, code: 'validation', message: '발행된 청첩장만 반영할 수 있어요' };
        return { ok: true, invitation: stampUser({ ...invitation, hasUnpublishedChanges: false, purgeAt: purgeAtFor(invitation.ceremony.date) }, now()) };
      }));
    },
    async unpublish(id) {
      return exclusive(() => changeInvitation(id, 'unpublish', (invitation) => {
        if (invitation.status !== 'published') return { ok: false, code: 'validation', message: '발행된 청첩장만 취소할 수 있어요' };
        return { ok: true, invitation: stampUser({ ...invitation, status: 'unpublished', hasUnpublishedChanges: false }, now()) };
      }));
    },
    async deleteInvitation(id, confirm) {
      return exclusive(async () => {
        const loaded = await owned(id);
        if (!loaded) return { ok: false as const, code: 'not_found' as const };
        if (loaded.state.session.isAnonymous && loaded.invitation.status !== 'draft') return { ok: false as const, code: 'login_required' as const };
        if (loaded.invitation.status !== 'draft' && confirm !== '삭제') return { ok: false as const, code: 'validation' as const, message: '삭제라고 입력해 주세요' };
        const deleted = stampUser({ ...loaded.invitation, status: 'deleted' as const }, now());
        await repo.write(deleted);
        if (loaded.state.session.isAnonymous) return { ok: true as const };
        const rebuilt = nextRebuild(loaded.state, deleted.slug, 'delete');
        host.save(rebuilt.state);
        return { ok: true as const, staticRebuild: rebuilt.staticRebuild };
      });
    },
    async invitationSettings(id) {
      const loaded = await owned(id);
      if (!loaded) return { ok: false as const, code: 'not_found' as const };
      if (loaded.state.session.isAnonymous) return { ok: false as const, code: 'forbidden' as const, reason: 'login_required' };
      return { ok: true as const, settings: invitationSettingsFrom(loaded.invitation), etag: loaded.invitation.etag };
    },
    async updateInvitationSettings(id, body, ifMatch) {
      return exclusive(async () => {
        const loaded = await owned(id);
        if (!loaded) return { ok: false as const, code: 'not_found' as const };
        if (loaded.state.session.isAnonymous) return { ok: false as const, code: 'forbidden' as const, reason: 'login_required' };
        if (!ifMatch.trim()) return { ok: false as const, code: 'validation' as const, field: 'if-match', reason: 'required' };
        if (!etagsMatch(loaded.invitation.etag, ifMatch)) return { ok: false as const, code: 'conflict' as const };
        const rejected = settingsPatchError(body);
        if (rejected) return { ok: false as const, code: 'validation' as const, field: rejected.field, reason: rejected.reason };
        const deadline = body.rsvp?.deadline;
        if (deadline && loaded.invitation.ceremony.date && loaded.invitation.ceremony.time) {
          const ceremony = new Date(`${loaded.invitation.ceremony.date}T${loaded.invitation.ceremony.time}:00+09:00`);
          if (new Date(deadline).getTime() > ceremony.getTime()) {
            return { ok: false as const, code: 'validation' as const, field: 'rsvp.deadline', reason: 'deadline_after_ceremony' };
          }
        }
        const next = stampUser(
          {
            ...loaded.invitation,
            hasUnpublishedChanges: loaded.invitation.status === 'published' ? true : loaded.invitation.hasUnpublishedChanges,
            rsvp: {
              ...loaded.invitation.rsvp,
              deadline: deadline === undefined ? loaded.invitation.rsvp.deadline : deadline,
              deadlineOverride: deadline === undefined ? loaded.invitation.rsvp.deadlineOverride : deadline !== null,
            },
          },
          now(),
        );
        await repo.write(next);
        return { ok: true as const, settings: invitationSettingsFrom(next), etag: next.etag };
      });
    },
    async addRecipients(id, names) {
      return exclusive(() => mutateRecipients(id, (records, invitation) => {
        const parsed = parseRecipientPaste(names.join('\n'));
        if (parsed.error || parsed.names.length === 0) return { ok: false, code: 'validation', message: parsed.error ?? '이름을 입력해 주세요' };
        const created = parsed.names.map((name) => ({ id: crypto.randomUUID(), name, revoked: false, token: newToken(), response: null }));
        return { ok: true, records: [...records, ...created], recipients: created.map((item) => toRecipient(item, invitation.slug)) };
      }));
    },
    async updateRecipient(id, recipientId, name) {
      return exclusive(() => mutateRecipients(id, (records, invitation) => {
        const nextName = normalizeRecipientName(name);
        if (!nextName) return { ok: false, code: 'validation', message: '이름을 입력해 주세요' };
        if ([...nextName].length > 20) return { ok: false, code: 'validation', message: '이름은 20자까지 입력할 수 있어요' };
        const recordsNext = records.map((item) => (item.id === recipientId ? { ...item, name: nextName } : item));
        const updated = recordsNext.find((item) => item.id === recipientId);
        if (!updated) return { ok: false, code: 'not_found' };
        return { ok: true, records: recordsNext, recipients: [toRecipient(updated, invitation.slug)] };
      }));
    },
    async reissueRecipient(id, recipientId) {
      return exclusive(() => mutateRecipients(id, (records, invitation) => {
        const recordsNext = records.map((item) => (item.id === recipientId ? { ...item, token: newToken(), revoked: false } : item));
        const updated = recordsNext.find((item) => item.id === recipientId);
        if (!updated) return { ok: false, code: 'not_found' };
        return { ok: true, records: recordsNext, recipients: [toRecipient(updated, invitation.slug)] };
      }));
    },
    async revokeRecipient(id, recipientId) {
      return exclusive(() => mutateRecipients(id, (records, invitation) => {
        const recordsNext = records.map((item) => (item.id === recipientId ? { ...item, revoked: true } : item));
        const updated = recordsNext.find((item) => item.id === recipientId);
        if (!updated) return { ok: false, code: 'not_found' };
        return { ok: true, records: recordsNext, recipients: [toRecipient(updated, invitation.slug)] };
      }));
    },
    async rsvpDashboard(id) {
      const loaded = await owned(id);
      if (!loaded) return { ok: false, code: 'not_found' };
      if (loaded.state.session.isAnonymous) return { ok: false, code: 'login_required' };
      return {
        ok: true,
        dashboard: buildRsvpDashboard({
          deadline: loaded.invitation.rsvp.deadline,
          now: now(),
          slug: loaded.invitation.slug,
          recipients: loaded.state.recipients[id] ?? [],
          invite: loaded.state.publicRows[id]?.invite ?? [],
          rsvpLink: loaded.state.publicRows[id]?.rsvpLink ?? [],
        }),
      };
    },
    async notices() {
      const state = host.load();
      const list = await repo.list();
      const invitations = [];
      for (const item of list) {
        if (!canEdit(state, item.id)) continue;
        const invitation = await repo.read(item.id);
        if (invitation) invitations.push(invitation);
      }
      return buildNotices(invitations, now());
    },
  };

  async function changeInvitation(
    id: string,
    action: 'publish' | 'apply' | 'unpublish',
    change: (invitation: EditorInvitation) => { ok: true; invitation: EditorInvitation } | { ok: false; code: 'validation' | 'login_required'; field?: string; message?: string },
  ) {
    const loaded = await owned(id);
    if (!loaded) return { ok: false as const, code: 'not_found' as const };
    if (loaded.state.session.isAnonymous) return { ok: false as const, code: 'login_required' as const, reason: 'login_required' };
    const changed = change(loaded.invitation);
    if (!changed.ok) return changed;
    await repo.write(changed.invitation);
    const rebuilt = nextRebuild(loaded.state, changed.invitation.slug, action);
    host.save(rebuilt.state);
    return { ok: true as const, invitation: changed.invitation, staticRebuild: rebuilt.staticRebuild };
  }

  async function mutateRecipients(
    id: string,
    change: (
      records: RecipientRecord[],
      invitation: EditorInvitation,
    ) => { ok: true; records: RecipientRecord[]; recipients: ReturnType<typeof toRecipient>[] } | { ok: false; code: 'validation' | 'not_found'; message?: string },
  ) {
    const loaded = await owned(id);
    if (!loaded) return { ok: false as const, code: 'not_found' as const };
    if (loaded.state.session.isAnonymous) return { ok: false as const, code: 'login_required' as const, reason: 'login_required' };
    const changed = change(loaded.state.recipients[id] ?? [], loaded.invitation);
    if (!changed.ok) return changed;
    host.save({ ...loaded.state, recipients: { ...loaded.state.recipients, [id]: changed.records } });
    return { ok: true as const, recipients: changed.recipients };
  }
}

export function rememberOwner(host: HostPersistence, id: string) {
  const state = host.load();
  if (state.owners[id]) return;
  host.save({ ...state, owners: { ...state.owners, [id]: state.session.userId } });
}

export function visibleSummary(host: HostPersistence, item: { id: string; status: string }) {
  const state = host.load();
  return item.status !== 'deleted' && canEdit(state, item.id);
}

export function withRsvp(host: HostPersistence, item: EditorInvitationSummary): EditorInvitationSummary {
  return { ...item, rsvp: rsvpCounts(host.load(), item.id) };
}

export function emptyHostForTests(): HostState {
  return freshHost('anon-test');
}
