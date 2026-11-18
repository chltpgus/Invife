'use client';

import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Link from 'next/link';
import HostBar from '@/components/molecules/HostBar';
import Sheet from '@/components/molecules/Sheet';
import { kstParts, WEEK_KO } from '@/domain/dates';
import { useEditorInvitation } from '@/domain/editor/query';
import { useDeleteInvitation, useInvitationSettings, useUnpublishInvitation } from '@/domain/host/query';
import { useEditorSession } from '@/domain/session/query';
import { FLASH_TOAST_KEY } from '@/editor/contract';
import { formatPurgeDate } from '@/editor/host';
import { usePathId } from '@/editor/use-path-id';

interface SettingsScreenProps { routeId?: string }

const SettingsScreen = ({ routeId = 'local' }: SettingsScreenProps) => {
  const [queries] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false }, mutations: { retry: false } } }));
  return (
    <QueryClientProvider client={queries}>
      <SettingsBody routeId={routeId} />
    </QueryClientProvider>
  );
};

function SettingsBody({ routeId }: { routeId: string }) {
  const { id, ready } = usePathId(routeId, 'dashboard');
  const invitationQuery = useEditorInvitation(id, ready);
  const session = useEditorSession();
  const settings = useInvitationSettings(id, ready && session.data?.isAnonymous === false);
  const unpublish = useUnpublishInvitation();
  const remove = useDeleteInvitation();
  const [mode, setMode] = useState<'unpublish' | 'delete' | null>(null);
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    document.title = '초대장 설정 · Invife';
  }, []);
  const invitation = invitationQuery.data;
  if (!ready || invitationQuery.isPending || !invitation) {
    return <main className="app-root ed-page"><p>{invitationQuery.data === null ? '이 청첩장을 찾지 못했어요' : '설정을 불러오고 있어요'}</p></main>;
  }
  const needsWord = invitation.status !== 'draft';
  const deadline = settings.data?.ok ? settings.data.settings.rsvp.deadline : invitation.rsvp.deadline;

  async function cancelPublish() {
    setError('');
    const result = await unpublish.mutateAsync(id);
    if (!result.ok) {
      setError('발행을 취소하지 못했어요. 다시 시도해 주세요');
      return;
    }
    setMode(null);
    window.location.assign('/dashboard/');
  }

  async function destroy() {
    setError('');
    const result = await remove.mutateAsync({ id, confirm: needsWord ? confirm : undefined });
    if (!result.ok) {
      setError(result.message ?? '삭제하지 못했어요. 다시 시도해 주세요');
      return;
    }
    sessionStorage.setItem(FLASH_TOAST_KEY, '삭제했어요');
    window.location.assign('/dashboard/');
  }

  return (
    <main className="app-root">
      <HostBar title="초대장 설정" backHref="/dashboard/" backLabel="내 초대장" />
      <div className="ed-page ed-stack">
        <p className="ed-caption">{invitation.links.invitePath}</p>
        <p>{deadlineLabel(deadline)} <Link href={`/edit/${id}/#section-rsvp`}>마감 변경</Link></p>
        {invitation.purgeAt ? <p>{formatPurgeDate(invitation.purgeAt)}에 사진과 하객 정보가 자동으로 지워져요. 삭제 전에는 대시보드와 카카오 계정 이메일로 알려 드려요.</p> : <p className="ed-caption">예식 날짜를 정하면 자동 삭제 예정일이 나와요.</p>}
        <Link className="ed-btn-secondary" href={`/edit/${id}/`}>내용 고치기</Link>
        {invitation.status === 'published' ? (
          <button type="button" className="ed-btn-danger-line" onClick={() => setMode('unpublish')}>발행 취소</button>
        ) : null}
        {invitation.status === 'unpublished' ? <p className="ed-caption">다시 발행하면 같은 링크로 돌아와요.</p> : null}
        <button type="button" className="ed-btn-text ed-danger-text" onClick={() => { setConfirm(''); setMode('delete'); }}>청첩장 삭제</button>
        {error ? <p className="ed-error" role="alert">{error}</p> : null}
      </div>
      {mode === 'unpublish' ? (
        <Sheet title="발행을 취소할까요?" onClose={() => setMode(null)}>
          <p>발행을 취소하면 링크를 연 사람에게 ‘초대장을 찾을 수 없어요’가 보여요. 응답과 사진은 남아 있고, 다시 발행하면 같은 링크로 돌아와요.</p>
          <button type="button" className="ed-btn-danger-line" disabled={unpublish.isPending} onClick={() => void cancelPublish()}>발행 취소</button>
          <button type="button" className="ed-btn-secondary" onClick={() => setMode(null)}>닫기</button>
        </Sheet>
      ) : null}
      {mode === 'delete' ? (
        <Sheet title="청첩장을 삭제할까요?" onClose={() => setMode(null)}>
          <p>청첩장을 삭제하면 사진, 하객 명단, 응답이 모두 지워지고 되돌릴 수 없어요.</p>
          {needsWord ? (
            <label className="ed-field">
              확인을 위해 삭제라고 입력해 주세요
              <input value={confirm} onChange={(event) => setConfirm(event.target.value)} />
            </label>
          ) : null}
          <button type="button" className="ed-btn-danger" disabled={remove.isPending || (needsWord && confirm !== '삭제')} onClick={() => void destroy()}>삭제하기</button>
          <button type="button" className="ed-btn-secondary" onClick={() => setMode(null)}>취소</button>
        </Sheet>
      ) : null}
    </main>
  );
}

function deadlineLabel(deadline: string | null): string {
  if (!deadline) return '응답 마감은 예식 전날로 계산돼요';
  const parts = kstParts(deadline);
  return `응답 마감 ${parts.month}월 ${parts.day}일(${WEEK_KO[parts.weekday]})`;
}

export default SettingsScreen;
