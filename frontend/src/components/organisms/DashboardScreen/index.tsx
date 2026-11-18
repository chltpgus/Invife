'use client';

import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Link from 'next/link';
import MoreVertical from '@/components/atoms/svg/MoreVertical';
import Plus from '@/components/atoms/svg/Plus';
import AdSlot from '@/components/molecules/AdSlot';
import KakaoLogin from '@/components/molecules/KakaoLogin';
import ToastProvider, { copyText, useToast } from '@/components/molecules/Toast';
import { useAppSettings, useDashboardInvitations, useHostNotices, usePatchAppSettings } from '@/domain/host/query';
import { useEditorSession, useSignInKakao } from '@/domain/session/query';
import { FLASH_TOAST_KEY } from '@/editor/contract';
import { invitationStatusLabel } from '@/editor/host';
import { absoluteUrl, resolveAssetUrl } from '@/env';
import { formatLongDate } from '@/domain/dates';

interface DashboardScreenProps { title?: string }

const DashboardScreen = ({ title = '내 초대장' }: DashboardScreenProps) => {
  const [queries] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false }, mutations: { retry: false } } }));
  return (
    <QueryClientProvider client={queries}>
      <ToastProvider lift={false}>
        <DashboardBody title={title} />
      </ToastProvider>
    </QueryClientProvider>
  );
};

function DashboardBody({ title }: { title: string }) {
  const list = useDashboardInvitations();
  const notices = useHostNotices();
  const session = useEditorSession();
  const appSettings = useAppSettings();
  const patchAds = usePatchAppSettings();
  const signIn = useSignInKakao();
  const notify = useToast();
  const [now] = useState(() => new Date());
  const [menu, setMenu] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = `${title} · Invife`;
    const flash = sessionStorage.getItem(FLASH_TOAST_KEY);
    if (!flash) return;
    sessionStorage.removeItem(FLASH_TOAST_KEY);
    notify(flash, 'ok');
  }, [notify, title]);

  async function login() {
    setError('');
    const result = await signIn.mutateAsync(absoluteUrl('/dashboard/'));
    if (!result.ok) {
      setError(result.code === 'unconfigured' ? '카카오 로그인을 아직 연결하지 않았어요.' : '로그인하지 못했어요. 다시 시도해 주세요');
      return;
    }
    if (!result.redirected) window.location.assign('/dashboard/');
  }

  return (
    <main className="app-root">
      <header className="ed-top">
        <h1>{title}</h1>
        <Link className="ed-btn" href="/new/">새로 만들기</Link>
      </header>
      <div className="ed-dash">
        {notices.data?.map((notice) => (
          <p key={notice.id} className="ed-banner is-warn" role="status">{notice.message}</p>
        ))}
        {appSettings.data?.ok && appSettings.data.settings.canEditAds ? (
          <label className="ed-field">
            광고
            <input
              type="checkbox"
              checked={appSettings.data.settings.adsEnabled}
              disabled={patchAds.isPending}
              onChange={(event) => void patchAds.mutateAsync(event.target.checked)}
            />
          </label>
        ) : null}
        <AdSlot />
        {session.data?.isAnonymous ? (
          <div className="ed-card ed-stack">
            <p>이 브라우저의 초안만 보여요.</p>
            <KakaoLogin label="카카오로 로그인하고 내 청첩장 모두 보기" pending={signIn.isPending} onClick={() => void login()} />
            {error ? <p className="ed-error" role="alert">{error}</p> : null}
          </div>
        ) : null}
        {list.isPending ? (
          <div className="ed-grid" aria-hidden="true">
            <div className="ed-card ed-skel" />
            <div className="ed-card ed-skel" />
            <div className="ed-card ed-skel" />
          </div>
        ) : null}
        {list.isError ? (
          <p className="ed-error" role="alert">
            목록을 불러오지 못했어요. <button type="button" className="ed-btn-text" onClick={() => void list.refetch()}>다시 시도</button>
          </p>
        ) : null}
        {list.data && list.data.length === 0 ? (
          <div className="ed-card ed-stack">
            <p>아직 만든 청첩장이 없어요</p>
            <Link className="ed-btn" href="/new/">무료로 만들기</Link>
          </div>
        ) : null}
        {list.data && list.data.length > 0 ? (
          <ul className="ed-grid">
            {list.data.map((item) => {
              const names = [item.groomName, item.brideName].filter(Boolean).join(' · ') || '새 청첩장';
              return (
                <li key={item.id} className="ed-card ed-invite">
                  <div className="ed-cover-slot">{item.coverSrc ? <img src={resolveAssetUrl(item.coverSrc)} alt="" /> : <span>사진 없음</span>}</div>
                  <div>
                    <strong>{names}</strong>
                    <p className="ed-caption">{item.ceremonyDate && /^\d{4}-\d{2}-\d{2}$/.test(item.ceremonyDate) ? formatLongDate(item.ceremonyDate) : '날짜 없음'}</p>
                    <p className="ed-badge">{invitationStatusLabel(item.status, item.ceremonyDate, now)}</p>
                    <p className="ed-caption">응답 {item.rsvp.responses} · 참석 {item.rsvp.attendingGuests}명{item.rsvp.unanswered === null ? '' : ` · 미응답 ${item.rsvp.unanswered}`}</p>
                  </div>
                  <button type="button" className="ed-icon-btn" aria-label={`${names} 더보기`} onClick={() => setMenu(menu === item.id ? null : item.id)}>
                    <MoreVertical size={18} />
                  </button>
                  {menu === item.id ? (
                    <div className="ed-menu">
                      <Link href={`/edit/${item.id}/`}>편집</Link>
                      {item.status === 'published' ? (
                        <button type="button" onClick={() => void copyText(absoluteUrl(`/i/${item.slug}/`), '링크를 복사했어요', notify)}>링크 복사</button>
                      ) : null}
                      <Link href={`/dashboard/${item.id}/rsvp/`}>응답 보기</Link>
                      <Link href={`/dashboard/${item.id}/settings/`}>설정</Link>
                    </div>
                  ) : null}
                </li>
              );
            })}
            <li>
              <Link className="ed-card ed-new" href="/new/"><Plus /> 새로 만들기</Link>
            </li>
          </ul>
        ) : null}
      </div>
    </main>
  );
}

export default DashboardScreen;
