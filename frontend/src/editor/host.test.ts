import { describe, expect, it } from 'vitest';
import { summarizeInvitation } from '@/editor/client';
import { createMemoryEditorClient, createStoredEditorClient, type InvitationRepository } from '@/editor/fixture-client';
import { alreadyLinkedMessage, type EditorInvitation } from '@/editor/contract';
import { buildRsvpDashboard, freshHost, linkKakaoAccount, memoryHost, parseRecipientPaste } from '@/editor/host';

describe('하객 이름 붙여넣기', () => {
  it('줄바꿈만 나누고 쉼표는 이름에 남긴다', () => {
    expect(parseRecipientPaste('김하늘\n이준\n')).toEqual({ names: ['김하늘', '이준'], error: null });
    expect(parseRecipientPaste('김하늘, 이준').names).toEqual(['김하늘, 이준']);
    expect(parseRecipientPaste('   ').error).toBe('이름을 입력해 주세요');
    expect(parseRecipientPaste('가'.repeat(21)).error).toBe('이름은 20자까지 입력할 수 있어요');
  });
});

describe('카카오 계정으로 초안 옮기기', () => {
  it('이미 연결된 identity 문장만 기존 계정으로 본다', () => {
    expect(alreadyLinkedMessage('Identity is already linked')).toBe(true);
    expect(alreadyLinkedMessage('Identity is already linked to another user')).toBe(true);
    expect(alreadyLinkedMessage('identity already linked manually')).toBe(false);
  });

  it('이미 가입된 계정이면 연결 대신 옮길지 묻도록 거절한다', () => {
    const state = freshHost('anon-1');
    state.kakaoUserId = 'kakao-1';
    expect(linkKakaoAccount(state).linked).toBe(false);
    expect(linkKakaoAccount(state).state.session.isAnonymous).toBe(true);
  });

  it('옮기기에 동의하면 초안 주인이 그 계정이 되고, 익명인 동안은 발행하지 못한다', async () => {
    const invitations = new Map<string, EditorInvitation>();
    const repo: InvitationRepository = {
      async list() {
        return [...invitations.values()].map(summarizeInvitation);
      },
      async read(id) {
        return invitations.get(id) ?? null;
      },
      async write(invitation) {
        invitations.set(invitation.id, invitation);
      },
    };
    const state = freshHost('anon-1');
    state.kakaoUserId = 'kakao-1';
    const client = createStoredEditorClient(repo, new Map(), () => new Date('2026-11-18T00:00:00.000Z'), memoryHost(state));
    const created = await client.createInvitation({ theme: 'ivory', groomName: '김민준', brideName: '이서연', ceremonyDate: '2027-05-15', ceremonyTime: '13:00' });
    expect(await client.publish(created.id)).toMatchObject({ ok: false, code: 'login_required' });
    expect(await client.linkKakao('/edit/x/publish/')).toMatchObject({
      ok: false,
      code: 'existing_account',
      message: 'Identity is already linked to another user',
    });
    const ticket = await client.createClaimTicket([created.id]);
    expect(ticket.ok).toBe(true);
    if (!ticket.ok) return;
    const signed = await client.signInKakao('/edit/publish/');
    expect(signed.ok && !signed.redirected).toBe(true);
    expect(await client.createClaimTicket([created.id])).toMatchObject({ ok: false, code: 'forbidden', reason: 'not_anonymous' });
    const claimed = await client.claimDrafts(ticket.ticket);
    expect(claimed.ok).toBe(true);
    expect((await client.listInvitations()).map((item) => item.id)).toEqual([created.id]);
    const blocked = await client.publish(created.id);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.code).toBe('validation');
  });
});

describe('발행된 목 초대장', () => {
  it('로그인한 뒤에도 서명 이름이 없으면 발행하지 않는다', async () => {
    const client = createMemoryEditorClient(() => new Date('2026-11-18T00:00:00.000Z'));
    const created = await client.createInvitation({ groomName: '김민준', brideName: '이서연', ceremonyDate: '2027-05-15', ceremonyTime: '13:00' });
    expect((await client.linkKakao('/edit/x/publish/')).ok).toBe(true);
    await client.autosave(created.id, { groom: { givenName: '' }, ceremony: { venueName: '더채플', address: '서울' } }, created.etag);
    const result = await client.publish(created.id);
    expect(result.ok).toBe(false);
  });

  it('발행과 영구 사용자 삭제는 staticRebuild 를 주고, 익명 초안 삭제는 ok 만 준다', async () => {
    const invitations = new Map<string, EditorInvitation>();
    const repo: InvitationRepository = {
      async list() {
        return [...invitations.values()].map(summarizeInvitation);
      },
      async read(id) {
        return invitations.get(id) ?? null;
      },
      async write(invitation) {
        invitations.set(invitation.id, invitation);
      },
    };
    const now = () => new Date('2026-11-18T00:00:00.000Z');
    const client = createStoredEditorClient(repo, new Map(), now, memoryHost(freshHost('anon-2')));
    const created = await client.createInvitation({ theme: 'ivory', groomName: '김민준', brideName: '이서연', ceremonyDate: '2027-05-15', ceremonyTime: '13:00' });
    expect(await client.deleteInvitation(created.id)).toEqual({ ok: true });

    const again = await client.createInvitation({ theme: 'ivory', groomName: '김민준', brideName: '이서연', ceremonyDate: '2027-05-15', ceremonyTime: '13:00' });
    const stored = await repo.read(again.id);
    if (!stored) throw new Error('missing');
    stored.groom.givenName = '민준';
    stored.bride.givenName = '서연';
    stored.ceremony.venueName = '더채플';
    stored.ceremony.address = '서울시 강남구 테헤란로 1';
    stored.photos = [{
      id: 'p',
      sort: 0,
      status: 'ready',
      width: 800,
      height: 1000,
      focal: { x: 0.5, y: 0.4 },
      crop: { x: 0, y: 0, width: 1, height: 1 },
      filter: 'original',
      lowQuality: false,
      src: { w800: 'a', w1200: 'a', w1600: 'a', thumb: 'a' },
      lqip: 'a',
    }];
    await repo.write(stored);
    expect((await client.linkKakao('/edit/x/publish/')).ok).toBe(true);
    const published = await client.publish(again.id);
    expect(published.ok).toBe(true);
    if (!published.ok) return;
    expect(published.staticRebuild).toMatchObject({ action: 'publish', slug: again.slug, pagePath: `/i/${again.slug}/`, documentPath: `/v1/invitations/${again.slug}` });
    const applied = await client.applyChanges(again.id);
    expect(applied.ok && applied.staticRebuild.action).toBe('apply');
    expect(applied.ok && applied.staticRebuild.slug).toBe(again.slug);
    const settings = await client.invitationSettings(again.id);
    expect(settings.ok && settings.settings.rsvp.enabled).toBe(true);
    expect(settings.ok && settings.settings.slugEditable).toBe(false);
    if (!settings.ok) return;
    expect(await client.updateInvitationSettings(again.id, { rsvp: { enabled: false } }, settings.etag)).toMatchObject({ ok: false, code: 'validation', reason: 'not_supported' });
    expect(await client.updateInvitationSettings(again.id, { slug: 'custom' }, settings.etag)).toMatchObject({ ok: false, reason: 'not_supported' });
    expect(await client.updateInvitationSettings(again.id, { publicLinkEnabled: false }, settings.etag)).toMatchObject({ ok: false, reason: 'not_supported' });
    const removed = await client.deleteInvitation(again.id, '삭제');
    expect(removed.ok && removed.staticRebuild?.action).toBe('delete');
    const state = freshHost('admin');
    state.session.isAdmin = true;
    state.session.isAnonymous = false;
    const admin = createStoredEditorClient(repo, new Map(), now, memoryHost(state));
    const ads = await admin.updateAppSettings(true);
    expect(ads.ok).toBe(true);
    if (!ads.ok) return;
    expect(ads.settings.adsEnabled).toBe(true);
    expect(ads.settings.showAds).toBe(false);
    expect(await client.updateAppSettings(true)).toMatchObject({ ok: false, reason: 'admin_required' });
  });
});

describe('응답 집계', () => {
  it('폐기된 받는 사람은 미응답과 합계에서 빠지고 행은 남는다', () => {
    const dashboard = buildRsvpDashboard({
      deadline: null,
      now: new Date('2026-11-18T00:00:00.000Z'),
      slug: 's',
      recipients: [
        { id: 'a', name: '김하늘', revoked: false, token: 't', response: null },
        { id: 'b', name: '이준', revoked: true, token: 'u', response: null },
      ],
      invite: [{ id: 'p', channel: 'invite', name: '박서준', attending: true, companions: 1, updatedAt: '2026-11-01T00:00:00.000Z', duplicateName: false }],
      rsvpLink: [],
    });
    expect(dashboard.byChannel.personal.unanswered).toBe(1);
    expect(dashboard.byChannel.invite.attendingGuests).toBe(2);
    expect(dashboard.byChannel.rsvp_link.unanswered).toBeNull();
    expect(dashboard.totals.unanswered).toBe(1);
    expect(dashboard.totals.attendingGuests).toBe(2);
    expect(dashboard.byRecipient.find((row) => row.recipientId === 'b')).toMatchObject({ revoked: true, channel: 'personal' });
    expect(dashboard.byPublicLink.invite[0]?.channel).toBe('invite');
  });
});
