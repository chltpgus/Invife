'use client';

import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Link from 'next/link';
import CheckCircle from '@/components/atoms/svg/CheckCircle';
import AdSlot from '@/components/molecules/AdSlot';
import HostBar from '@/components/molecules/HostBar';
import KakaoShare from '@/components/molecules/KakaoShare';
import ToastProvider, { copyText, useToast } from '@/components/molecules/Toast';
import { useEditorInvitation } from '@/domain/editor/query';
import { ogDescription } from '@/domain/dates';
import { absoluteUrl, env } from '@/env';
import { usePathId } from '@/editor/use-path-id';

interface PublishedScreenProps { routeId?: string }

const PublishedScreen = ({ routeId = 'local' }: PublishedScreenProps) => {
  const [queries] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } }));
  return (
    <QueryClientProvider client={queries}>
      <ToastProvider lift={false}>
        <PublishedBody routeId={routeId} />
      </ToastProvider>
    </QueryClientProvider>
  );
};

function PublishedBody({ routeId }: { routeId: string }) {
  const { id, ready } = usePathId(routeId, 'edit');
  const invitationQuery = useEditorInvitation(id, ready);
  const notify = useToast();
  const [imageOk, setImageOk] = useState(true);
  useEffect(() => {
    document.title = '청첩장이 완성됐어요 · Invife';
  }, []);
  const invitation = invitationQuery.data;
  if (!ready || invitationQuery.isPending || !invitation) {
    return (
      <main className="app-root ed-page">
        <p>{invitationQuery.data === null ? '이 청첩장을 찾지 못했어요' : '청첩장을 불러오고 있어요'}</p>
      </main>
    );
  }
  const inviteUrl = absoluteUrl(invitation.links.invitePath || `/i/${invitation.slug}/`);
  const rsvpUrl = invitation.links.rsvpLinkPath ? absoluteUrl(invitation.links.rsvpLinkPath) : '';
  const names = [invitation.groom.name, invitation.bride.name].filter(Boolean).join(' · ') || '청첩장';
  const description = invitation.ceremony.date ? ogDescription({ ceremony: { date: invitation.ceremony.date, time: invitation.ceremony.time ?? undefined, venueName: invitation.ceremony.venueName } }) : '';
  return (
    <main className="app-root">
      <HostBar title="발행 완료" backHref="/dashboard/" backLabel="내 초대장" />
      <div className="ed-page ed-share">
        <p className="ed-done"><CheckCircle size={28} /> 청첩장이 완성됐어요</p>
        <p className="ed-link-line">{inviteUrl}</p>
        <p className="ed-caption">같은 주소를 서버가 다시 만들어요. 이 화면은 HTML을 굽지 않고, 하객 페이지에는 이름과 토큰을 넣지 않아요.</p>
        <article className="ed-og" aria-label="카톡에서 이렇게 보여요">
          {imageOk ? <img src={absoluteUrl(`/og/${invitation.slug}.jpg`)} alt="" onError={() => setImageOk(false)} /> : null}
          <div>
            <strong>{names} 결혼합니다</strong>
            <p>{description}</p>
            <span>카톡에서 이렇게 보여요</span>
          </div>
        </article>
        <div className="ed-stack">
          <KakaoShare title={`${names} 결혼합니다`} description={description} imageUrl={absoluteUrl(`/og/${invitation.slug}.jpg`)} pageUrl={inviteUrl} />
          {!env.kakaoJavaScriptKey ? <p className="ed-caption">카카오 공유 키를 넣으면 이 버튼으로 보낼 수 있어요.</p> : null}
          <button type="button" className="ed-btn-secondary ed-wide" onClick={() => void copyText(inviteUrl, '링크를 복사했어요', notify)}>공용 초대장 링크 복사</button>
          {rsvpUrl ? (
            <>
              <button type="button" className="ed-btn-secondary ed-wide" onClick={() => void copyText(rsvpUrl, '링크를 복사했어요', notify)}>공용 RSVP 링크 복사</button>
              <p className="ed-caption">이름을 직접 입력해 응답하는 링크예요. 응답은 따로 집계돼요.</p>
            </>
          ) : (
            <p className="ed-caption">공용 RSVP 링크는 발행하면 만들어져요.</p>
          )}
        </div>
        <div className="ed-share-gap" />
        <AdSlot />
        <section className="ed-stack">
          <h2 className="ed-title">다음 할 일</h2>
          <Link className="ed-card" href={`/dashboard/${id}/guests/`}>받는 사람별 링크 만들기 (선택)</Link>
          <Link className="ed-card" href={`/dashboard/${id}/rsvp/`}>응답 보기</Link>
          <Link className="ed-card" href={`/edit/${id}/`}>계속 고치기</Link>
        </section>
      </div>
    </main>
  );
}

export default PublishedScreen;
