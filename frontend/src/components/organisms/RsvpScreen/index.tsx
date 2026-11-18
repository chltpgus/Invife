'use client';

import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Link from 'next/link';
import HostBar from '@/components/molecules/HostBar';
import KakaoShare from '@/components/molecules/KakaoShare';
import { useEditorInvitation } from '@/domain/editor/query';
import { useRsvpDashboard } from '@/domain/host/query';
import { kstParts, WEEK_KO } from '@/domain/dates';
import { formatPurgeDate } from '@/editor/host';
import { absoluteUrl } from '@/env';
import { usePathId } from '@/editor/use-path-id';
import type { PublicRsvpRow, RsvpDashboard } from '@/editor/contract';

interface RsvpScreenProps { routeId?: string }

const RsvpScreen = ({ routeId = 'local' }: RsvpScreenProps) => {
  const [queries] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } }));
  return (
    <QueryClientProvider client={queries}>
      <RsvpBody routeId={routeId} />
    </QueryClientProvider>
  );
};

function RsvpBody({ routeId }: { routeId: string }) {
  const { id, ready } = usePathId(routeId, 'dashboard');
  const invitation = useEditorInvitation(id, ready);
  const dashboard = useRsvpDashboard(id, ready);
  const [tab, setTab] = useState<'people' | 'public'>('people');
  const [filter, setFilter] = useState<'all' | 'unanswered' | 'attending' | 'declined'>('all');
  useEffect(() => {
    document.title = '응답 · Invife';
  }, []);

  if (!ready || invitation.isPending) return <main className="app-root ed-page"><p>응답을 불러오고 있어요</p></main>;
  if (!invitation.data) return <main className="app-root ed-page"><p>이 청첩장을 찾지 못했어요</p></main>;
  if (dashboard.isPending) return <main className="app-root ed-page"><p>응답을 불러오고 있어요</p></main>;
  if (!dashboard.data || !dashboard.data.ok) {
    const message = dashboard.data?.code === 'login_required' ? '응답은 카카오 로그인 후에 볼 수 있어요.' : '응답을 불러오지 못했어요.';
    return (
      <main className="app-root">
        <HostBar title="응답" backHref="/dashboard/" />
        <div className="ed-page">
          <p className="ed-error" role="alert">{message} {dashboard.data?.code === 'login_required' ? null : <button type="button" className="ed-btn-text" onClick={() => void dashboard.refetch()}>다시 시도</button>}</p>
        </div>
      </main>
    );
  }

  const data = dashboard.data.dashboard;
  const people = data.byRecipient.filter((row) => {
    if (row.revoked) return filter === 'all';
    return filter === 'all' || row.status === filter;
  });
  const purge = invitation.data.purgeAt;

  return (
    <main className="app-root">
      <HostBar title="응답" backHref="/dashboard/" backLabel="내 초대장" />
      <div className="ed-page ed-stack">
        <div className="ed-stats">
          <article className="ed-card"><span className="ed-stat">{data.totals.attendingGuests}</span><p>총 참석 인원</p><p className="ed-caption">응답 {data.totals.attendingResponses}명 + 동행 {data.totals.companionSum}명</p></article>
          <article className="ed-card"><span className="ed-stat">{data.totals.declined}</span><p>불참</p></article>
          {data.totals.unanswered === null ? (
            <article className="ed-card"><p>명단을 만들면 미응답자를 볼 수 있어요</p><Link href={`/dashboard/${id}/guests/`}>명단 만들기</Link></article>
          ) : (
            <article className="ed-card"><span className="ed-stat">{data.totals.unanswered}</span><p>미응답</p></article>
          )}
        </div>
        <p>{deadlineLine(data)} <Link href={`/edit/${id}/#section-rsvp`}>마감 변경</Link></p>
        <div className="ed-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'people'} onClick={() => setTab('people')}>받는 사람별</button>
          <button type="button" role="tab" aria-selected={tab === 'public'} onClick={() => setTab('public')}>공용 링크</button>
        </div>
        {tab === 'people' ? (
          <>
            <div className="ed-tabs">
              {(['all', 'unanswered', 'attending', 'declined'] as const).map((item) => (
                <button key={item} type="button" className={filter === item ? 'is-on' : ''} onClick={() => setFilter(item)}>{filterLabel[item]}</button>
              ))}
            </div>
            {people.length === 0 ? <EmptyShare id={id} /> : (
              <ul className="ed-guest-list">
                {people.map((row) => (
                  <li key={row.recipientId}>
                    <strong>{row.listName}</strong>
                    <span>{row.revoked ? '삭제된 명단' : statusLabel(row.status, row.companions)}</span>
                    {row.revoked ? <span className="ed-caption">집계와 미응답에서 빠졌어요</span> : null}
                    {row.responseName && row.responseName !== row.listName ? <span className="ed-caption">입력한 이름: {row.responseName}</span> : null}
                    <span className="ed-caption">{row.updatedAt ? new Date(row.updatedAt).toLocaleString('ko-KR') : '응답 전'}</span>
                    {row.status === 'unanswered' && row.path ? <KakaoShare compact label="카톡 다시 보내기" title="청첩장이 도착했어요" pageUrl={absoluteUrl(row.path)} /> : null}
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <div className="ed-stack">
            <PublicBlock title="공용 초대장" rows={data.byPublicLink.invite} />
            <PublicBlock title="공용 RSVP" rows={data.byPublicLink.rsvpLink} />
            {data.byPublicLink.invite.length + data.byPublicLink.rsvpLink.length === 0 ? <EmptyShare id={id} /> : null}
          </div>
        )}
        {purge ? <p className="ed-caption">{formatPurgeDate(purge)}에 사진과 하객 정보가 자동으로 지워져요</p> : null}
      </div>
    </main>
  );
}

const filterLabel = { all: '전체', unanswered: '미응답', attending: '참석', declined: '불참' };

function statusLabel(status: 'unanswered' | 'attending' | 'declined', companions: number): string {
  if (status === 'unanswered') return '미응답';
  if (status === 'declined') return '불참';
  return companions > 0 ? `참석 · 동행 ${companions}` : '참석';
}

function deadlineLine(data: RsvpDashboard): string {
  if (!data.deadline) return '예식 날짜를 정하면 마감이 정해져요';
  if (data.closed) return '마감됨';
  const parts = kstParts(data.deadline);
  const dayMs = 24 * 60 * 60 * 1000;
  const left = Math.max(0, Math.ceil((new Date(data.deadline).getTime() - Date.now()) / dayMs));
  return `${parts.month}월 ${parts.day}일(${WEEK_KO[parts.weekday]}) 마감 · ${left}일 남음`;
}

function EmptyShare({ id }: { id: string }) {
  return (
    <div className="ed-card ed-stack">
      <p>아직 응답이 없어요. 링크를 보내 보세요</p>
      <Link className="ed-btn" href={`/edit/${id}/published/`}>공유 화면</Link>
    </div>
  );
}

function PublicBlock({ title, rows }: { title: string; rows: PublicRsvpRow[] }) {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.name, (counts.get(row.name) ?? 0) + 1);
  return (
    <section>
      <h2 className="ed-title">{title}</h2>
      <ul className="ed-guest-list">
        {rows.map((row) => (
          <li key={row.id}>
            <strong>{row.name}</strong>
            {(counts.get(row.name) ?? 0) > 1 ? <span className="ed-badge">같은 이름 {counts.get(row.name)}건</span> : null}
            <span>{row.attending ? `참석 · 동행 ${row.companions}` : '불참'}</span>
            <span className="ed-caption">{new Date(row.updatedAt).toLocaleString('ko-KR')}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default RsvpScreen;
