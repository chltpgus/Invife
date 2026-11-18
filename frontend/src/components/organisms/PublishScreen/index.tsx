'use client';

import { useEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Link from 'next/link';
import HostBar from '@/components/molecules/HostBar';
import KakaoLogin from '@/components/molecules/KakaoLogin';
import Sheet from '@/components/molecules/Sheet';
import { fieldIssues, publishIssues, type EditorDraft } from '@/domain/editor';
import { useEditorInvitation } from '@/domain/editor/query';
import { useApplyInvitation, usePublishInvitation } from '@/domain/host/query';
import { useClaimDrafts, useCreateClaimTicket, useEditorSession, useLinkKakao, useSignInKakao } from '@/domain/session/query';
import { alreadyLinkedMessage, callbackAlreadyLinked, CLAIM_ASK_KEY, CLAIM_TICKET_KEY, PUBLISH_AFTER_LOGIN_KEY } from '@/editor/contract';
import { draftFromInvitation } from '@/editor/document';
import { absoluteUrl } from '@/env';
import { usePathId } from '@/editor/use-path-id';
import { isDeadlineClosed } from '@/domain/dates';

interface PublishScreenProps { routeId?: string }

let signingIn = false;

const PublishScreen = ({ routeId = 'local' }: PublishScreenProps) => {
  const [queries] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false }, mutations: { retry: false } } }));
  return (
    <QueryClientProvider client={queries}>
      <PublishBody routeId={routeId} />
    </QueryClientProvider>
  );
};

function PublishBody({ routeId }: { routeId: string }) {
  const { id, ready } = usePathId(routeId, 'edit');
  const invitationQuery = useEditorInvitation(id, ready);
  const sessionQuery = useEditorSession();
  const link = useLinkKakao();
  const signIn = useSignInKakao();
  const ticket = useCreateClaimTicket();
  const claim = useClaimDrafts();
  const publish = usePublishInvitation();
  const apply = useApplyInvitation();
  const [ask, setAsk] = useState(false);
  const [error, setError] = useState('');
  const [working, setWorking] = useState('');
  const resumed = useRef(false);
  const [linkedOnReturn] = useState(callbackAlreadyLinked);

  const invitation = invitationQuery.data;
  const session = sessionQuery.data;
  const draft = invitation ? draftFromInvitation(invitation) : null;
  const issues = draft ? publishIssues(fieldIssues(draft, new Date())) : [];

  useEffect(() => {
    document.title = '발행 · Invife';
  }, []);

  useEffect(() => {
    if (!linkedOnReturn || typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.delete('error');
    url.searchParams.delete('error_code');
    url.searchParams.delete('error_description');
    url.hash = '';
    window.history.replaceState(null, '', `${url.pathname}${url.search}`);
  }, [linkedOnReturn]);

  useEffect(() => {
    if (!ready || !invitation || !session || signingIn || resumed.current) return;
    if (session.isAnonymous) {
      if (!linkedOnReturn) return;
      resumed.current = true;
      void beginClaim(invitation.id);
      return;
    }
    if (sessionStorage.getItem(CLAIM_ASK_KEY) === invitation.id) {
      resumed.current = true;
      setAsk(true);
      return;
    }
    if (sessionStorage.getItem(PUBLISH_AFTER_LOGIN_KEY) === invitation.id) {
      resumed.current = true;
      sessionStorage.removeItem(PUBLISH_AFTER_LOGIN_KEY);
      void runPublish();
    }
    // 리다이렉트 복귀 때 한 번만 잇는다. beginClaim·runPublish 는 매 렌더 새 함수라 의존성에 넣지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, invitation, session, linkedOnReturn]);

  async function runPublish() {
    setError('');
    setWorking('청첩장을 만들고 있어요');
    const result = await publish.mutateAsync(id);
    setWorking('');
    if (!result.ok) {
      setError(result.code === 'login_required' ? '발행하려면 카카오로 로그인해 주세요' : result.message ?? '발행하지 못했어요. 입력한 내용은 저장돼 있어요');
      return;
    }
    window.location.assign(`/edit/${id}/published/`);
  }

  async function runApply() {
    setError('');
    setWorking('변경 사항을 반영하고 있어요');
    const result = await apply.mutateAsync(id);
    setWorking('');
    if (!result.ok) {
      setError(result.message ?? '반영하지 못했어요. 입력한 내용은 저장돼 있어요');
      return;
    }
    window.location.assign(`/edit/${id}/published/`);
  }

  async function beginClaim(invitationId: string) {
    setError('');
    signingIn = true;
    const created = await ticket.mutateAsync([invitationId]);
    if (!created.ok) {
      signingIn = false;
      setError(created.reason === 'not_anonymous' ? '이미 로그인된 계정에서는 초안을 옮길 수 없어요' : '초안을 옮기지 못했어요. 다시 시도해 주세요');
      return;
    }
    sessionStorage.setItem(CLAIM_TICKET_KEY, created.ticket);
    sessionStorage.setItem(CLAIM_ASK_KEY, invitationId);
    const signed = await signIn.mutateAsync(absoluteUrl(`/edit/${invitationId}/publish/`));
    if (!signed.ok) {
      signingIn = false;
      sessionStorage.removeItem(CLAIM_TICKET_KEY);
      sessionStorage.removeItem(CLAIM_ASK_KEY);
      setError(signed.code === 'unconfigured' ? '카카오 로그인을 아직 연결하지 않았어요.' : '로그인하지 못했어요. 다시 시도해 주세요');
      return;
    }
    if (signed.redirected) return;
    signingIn = false;
    setAsk(true);
  }

  async function startLogin() {
    if (!invitation) return;
    setError('');
    signingIn = true;
    sessionStorage.setItem(PUBLISH_AFTER_LOGIN_KEY, invitation.id);
    const result = await link.mutateAsync(absoluteUrl(`/edit/${invitation.id}/publish/`));
    if (result.ok && !result.redirected) {
      sessionStorage.removeItem(PUBLISH_AFTER_LOGIN_KEY);
      signingIn = false;
      await runPublish();
      return;
    }
    if (!result.ok && result.code === 'existing_account' && alreadyLinkedMessage(result.message)) {
      sessionStorage.removeItem(PUBLISH_AFTER_LOGIN_KEY);
      await beginClaim(invitation.id);
      return;
    }
    signingIn = false;
    if (!result.ok) {
      sessionStorage.removeItem(PUBLISH_AFTER_LOGIN_KEY);
      setError(result.code === 'unconfigured' ? '카카오 로그인을 아직 연결하지 않았어요.' : '로그인하지 못했어요. 다시 시도해 주세요');
    }
  }

  async function moveDraft() {
    const stored = sessionStorage.getItem(CLAIM_TICKET_KEY);
    setAsk(false);
    if (!stored) {
      setError('초안을 옮기지 못했어요. 다시 시도해 주세요');
      return;
    }
    const claimed = await claim.mutateAsync(stored);
    sessionStorage.removeItem(CLAIM_TICKET_KEY);
    sessionStorage.removeItem(CLAIM_ASK_KEY);
    if (!claimed.ok) {
      setError('초안을 옮기지 못했어요. 다시 시도해 주세요');
      return;
    }
    await runPublish();
  }

  function cancelMove() {
    sessionStorage.removeItem(CLAIM_TICKET_KEY);
    sessionStorage.removeItem(CLAIM_ASK_KEY);
    sessionStorage.removeItem(PUBLISH_AFTER_LOGIN_KEY);
    setAsk(false);
  }

  if (!ready || sessionQuery.isPending || invitationQuery.isPending || invitationQuery.isLoading || !draft || !invitation || !session) {
    return (
      <main className="app-root ed-page">
        <p>{invitationQuery.isError || invitationQuery.data === null ? '이 청첩장을 찾지 못했어요' : '청첩장을 불러오고 있어요'}</p>
      </main>
    );
  }

  const published = invitation.status === 'published';
  const deadlinePast = Boolean(invitation.rsvp.deadline && isDeadlineClosed(new Date(), invitation.rsvp.deadline));

  return (
    <main className="app-root">
      <HostBar title={published ? '변경 사항 반영' : '발행'} backHref={`/edit/${id}/`} backLabel="편집으로" />
      <div className="ed-page">
        <h2 className="ed-title">{published ? '하객 화면에 반영할까요?' : '발행 전 확인'}</h2>
        {issues.length > 0 ? (
          <>
            <p>필수 항목 {issues.length}개를 채워 주세요</p>
            <ul className="ed-link-list">
              {issues.map((issue) => (
                <li key={issue.id}>
                  <Link href={`/edit/${id}/#section-${issue.section}`}>{issue.message}</Link>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p>필수 항목이 모두 채워졌어요.</p>
        )}
        <p className="ed-caption">{hiddenSections(draft)}</p>
        {published ? (
          <p className="ed-caption">시간, 장소, 계좌를 고친 내용은 같은 주소로 반영돼요. 이미 응답한 하객에게는 따로 알려 주세요. 이미 보낸 카톡 미리보기는 바로 바뀌지 않을 수 있어요.</p>
        ) : null}
        {published && deadlinePast ? <p className="ed-caption">저장하면 바로 응답이 마감돼요.</p> : null}
        {working ? <p role="status">{working}</p> : null}
        {error ? <p className="ed-error" role="alert">{error}</p> : null}
        {published ? (
          <button type="button" className="ed-btn ed-wide" disabled={issues.length > 0 || Boolean(working)} onClick={() => void runApply()}>
            {working ? '반영 중…' : '반영하기'}
          </button>
        ) : session?.isAnonymous ? (
          <div className="ed-stack">
            <p>발행하려면 카카오로 로그인해 주세요. 지금까지 만든 내용은 그대로 카카오 계정에 저장돼요.</p>
            <KakaoLogin pending={link.isPending || signIn.isPending} disabled={issues.length > 0} onClick={() => void startLogin()} />
            <Link className="ed-btn-text" href={`/edit/${id}/`}>나중에 할게요</Link>
          </div>
        ) : (
          <button type="button" className="ed-btn ed-wide" disabled={issues.length > 0 || Boolean(working)} onClick={() => void runPublish()}>
            {working ? '발행 중…' : '발행하기'}
          </button>
        )}
      </div>
      {ask ? (
        <Sheet title="이 초안을 옮길까요?" onClose={() => setAsk(false)}>
          <p>이 카카오 계정은 이미 Invife에 가입돼 있어요. 이 초안을 그 계정으로 옮길까요?</p>
          <button type="button" className="ed-btn ed-wide" onClick={() => void moveDraft()}>옮기기</button>
          <button type="button" className="ed-btn-secondary ed-wide" onClick={cancelMove}>취소</button>
        </Sheet>
      ) : null}
    </main>
  );
}

function hiddenSections(draft: EditorDraft): string {
  const hidden: string[] = [];
  if (!draft.invitation.greeting?.trim()) hidden.push('인사말');
  const families = draft.invitation.families;
  const parentNamed = [families.groom?.father, families.groom?.mother, families.bride?.father, families.bride?.mother].some((parent) => parent?.name.trim());
  if (!parentNamed) hidden.push('혼주 성함');
  if (!draft.invitation.accounts.some((account) => account.holder.trim() && account.bank.trim() && account.number.trim())) hidden.push('마음 전하실 곳');
  if (hidden.length === 0) return '숨겨지는 섹션은 없어요.';
  return `비어 있어 숨겨지는 섹션: ${hidden.join(', ')}`;
}

export default PublishScreen;
