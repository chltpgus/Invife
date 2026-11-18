'use client';

import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import HostBar from '@/components/molecules/HostBar';
import KakaoLogin from '@/components/molecules/KakaoLogin';
import KakaoShare from '@/components/molecules/KakaoShare';
import Sheet from '@/components/molecules/Sheet';
import ToastProvider, { copyText, useToast } from '@/components/molecules/Toast';
import { useAddRecipients, useReissueRecipient, useRevokeRecipient, useRsvpDashboard, useUpdateRecipient } from '@/domain/host/query';
import { useEditorSession, useSignInKakao } from '@/domain/session/query';
import { absoluteUrl } from '@/env';
import { parseRecipientPaste } from '@/editor/host';
import { usePathId } from '@/editor/use-path-id';

interface GuestsScreenProps { routeId?: string }

const GuestsScreen = ({ routeId = 'local' }: GuestsScreenProps) => {
  const [queries] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false }, mutations: { retry: false } } }));
  return (
    <QueryClientProvider client={queries}>
      <ToastProvider lift={false}>
        <GuestsBody routeId={routeId} />
      </ToastProvider>
    </QueryClientProvider>
  );
};

function GuestsBody({ routeId }: { routeId: string }) {
  const { id, ready } = usePathId(routeId, 'dashboard');
  const session = useEditorSession();
  const signIn = useSignInKakao();
  const dashboard = useRsvpDashboard(id, ready && session.data?.isAnonymous === false);
  const add = useAddRecipients();
  const update = useUpdateRecipient();
  const reissue = useReissueRecipient();
  const revoke = useRevokeRecipient();
  const notify = useToast();
  const [name, setName] = useState('');
  const [paste, setPaste] = useState('');
  const [preview, setPreview] = useState<string[] | null>(null);
  const [error, setError] = useState('');
  const [pendingNames, setPendingNames] = useState<string[] | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [nextName, setNextName] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);

  useEffect(() => {
    document.title = '하객 명단 · Invife';
  }, []);

  const rows = dashboard.data?.ok ? dashboard.data.dashboard.byRecipient.filter((row) => !row.revoked) : [];
  const loginRequired = dashboard.data && !dashboard.data.ok && dashboard.data.code === 'login_required';

  async function submit(names: string[], force = false) {
    setError('');
    if (!force && names.some((item) => rows.some((row) => row.listName === item))) {
      setPendingNames(names);
      return;
    }
    const result = await add.mutateAsync({ id, names });
    if (!result.ok) {
      setError(result.code === 'login_required' ? '명단은 카카오 로그인 후에 만들 수 있어요' : result.message ?? '추가하지 못했어요');
      return;
    }
    setName('');
    setPaste('');
    setPreview(null);
    setPendingNames(null);
  }

  async function login() {
    const result = await signIn.mutateAsync(absoluteUrl(`/dashboard/${id}/guests/`));
    if (!result.ok) setError(result.code === 'unconfigured' ? '카카오 로그인을 아직 연결하지 않았어요.' : '로그인하지 못했어요. 다시 시도해 주세요');
    else if (!result.redirected) window.location.reload();
  }

  return (
    <main className="app-root">
      <HostBar title="하객 명단" backHref="/dashboard/" backLabel="내 초대장" />
      <div className="ed-page ed-stack">
        <p>명단 없이도 공용 초대장·RSVP 링크로 초대하고 응답할 수 있어요. 응답하지 않은 사람을 확인하고 싶을 때만 만드세요.</p>
        {session.data?.isAnonymous || loginRequired ? (
          <KakaoLogin pending={signIn.isPending} onClick={() => void login()} />
        ) : (
          <>
            <form className="ed-stack" onSubmit={(event) => { event.preventDefault(); const parsed = parseRecipientPaste(name); if (parsed.error) { setError(parsed.error); return; } void submit(parsed.names); }}>
              <label className="ed-field">
                이름
                <input value={name} maxLength={20} onChange={(event) => setName(event.target.value)} />
              </label>
              <button type="submit" className="ed-btn" disabled={add.isPending}>이름 추가</button>
            </form>
            <label className="ed-field">
              목록 붙여넣기
              <textarea value={paste} rows={5} placeholder="한 줄에 한 명" onChange={(event) => { setPaste(event.target.value); setPreview(null); }} />
            </label>
            <button type="button" className="ed-btn-secondary" onClick={() => { const parsed = parseRecipientPaste(paste); if (parsed.error) { setPreview(null); setError(parsed.error); return; } setError(''); setPreview(parsed.names); }}>목록 확인</button>
            {preview ? (
              <div className="ed-card">
                <p>{preview.length}명 추가돼요</p>
                <ul>{preview.map((item) => <li key={item}>{item}</li>)}</ul>
                <button type="button" className="ed-btn" onClick={() => void submit(preview)}>추가</button>
              </div>
            ) : null}
          </>
        )}
        {error ? <p className="ed-error" role="alert">{error}</p> : null}
        {dashboard.isPending && session.data && !session.data.isAnonymous ? <p>명단을 불러오고 있어요</p> : null}
        {dashboard.data && !dashboard.data.ok && dashboard.data.code !== 'login_required' ? (
          <p className="ed-error" role="alert">명단을 불러오지 못했어요. <button type="button" className="ed-btn-text" onClick={() => void dashboard.refetch()}>다시 시도</button></p>
        ) : null}
        {rows.length === 0 && session.data && !session.data.isAnonymous && dashboard.data?.ok ? <p className="ed-caption">아직 추가한 이름이 없어요.</p> : null}
        <ul className="ed-guest-list">
          {rows.map((row) => (
            <li key={row.recipientId}>
              {editing === row.recipientId ? (
                <form className="ed-guest-name" onSubmit={(event) => { event.preventDefault(); void update.mutateAsync({ id, recipientId: row.recipientId, name: nextName }).then((result) => { if (!result.ok) setError(result.message ?? '이름을 고치지 못했어요'); else setEditing(null); }); }}>
                  <input value={nextName} maxLength={20} aria-label="이름 수정" onChange={(event) => setNextName(event.target.value)} />
                  <button type="submit" className="ed-btn-secondary">저장</button>
                </form>
              ) : <strong>{row.listName}</strong>}
              <span className="ed-badge">{row.status === 'unanswered' ? '미응답' : row.status === 'attending' ? `참석 ${1 + row.companions}명` : '불참'}</span>
              <KakaoShare compact label="카톡" title="청첩장이 도착했어요" description={row.listName} pageUrl={row.path ? absoluteUrl(row.path) : ''} />
              <button type="button" className="ed-btn-text" disabled={!row.path} onClick={() => row.path && void copyText(absoluteUrl(row.path), '링크를 복사했어요', notify)}>링크 복사</button>
              <button type="button" className="ed-btn-text" aria-label={`${row.listName} 더보기`} onClick={() => setMenu(menu === row.recipientId ? null : row.recipientId)}>더보기</button>
              {menu === row.recipientId ? (
                <div className="ed-menu">
                  <button type="button" onClick={() => { setEditing(row.recipientId); setNextName(row.listName); setMenu(null); }}>이름 수정</button>
                  <button type="button" onClick={() => { setConfirmId(row.recipientId); setMenu(null); }}>링크 다시 만들기</button>
                  <button type="button" onClick={() => { setMenu(null); void revoke.mutateAsync({ id, recipientId: row.recipientId }); }}>삭제</button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
      {pendingNames ? (
        <Sheet title="같은 이름이 이미 있어요" onClose={() => setPendingNames(null)}>
          <p>같은 이름이 이미 있어요. 그래도 추가할까요?</p>
          <button type="button" className="ed-btn" onClick={() => void submit(pendingNames, true)}>추가</button>
          <button type="button" className="ed-btn-secondary" onClick={() => setPendingNames(null)}>취소</button>
        </Sheet>
      ) : null}
      {confirmId ? (
        <Sheet title="링크를 다시 만들까요?" onClose={() => setConfirmId(null)}>
          <p>기존 링크는 더 이상 열리지 않아요.</p>
          <button type="button" className="ed-btn" onClick={() => { const recipientId = confirmId; setConfirmId(null); void reissue.mutateAsync({ id, recipientId }); }}>다시 만들기</button>
          <button type="button" className="ed-btn-secondary" onClick={() => setConfirmId(null)}>닫기</button>
        </Sheet>
      ) : null}
    </main>
  );
}

export default GuestsScreen;
