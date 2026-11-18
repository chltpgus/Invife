'use client';
import ArrowLeft from '@/components/atoms/svg/ArrowLeft';
import Info from '@/components/atoms/svg/Info';
import Close from '@/components/atoms/svg/Close';
import Palette from '@/components/atoms/svg/Palette';
import PhoneFrame from '@/components/atoms/svg/PhoneFrame';
import Refresh from '@/components/atoms/svg/Refresh';
import Eye from '@/components/atoms/svg/Eye';
import CheckCircle from '@/components/atoms/svg/CheckCircle';
import Alert from '@/components/atoms/svg/Alert';
import Spinner from '@/components/atoms/svg/Spinner';
import CloudOff from '@/components/atoms/svg/CloudOff';
import CloudCheck from '@/components/atoms/svg/CloudCheck';
import ChevronUp from '@/components/atoms/svg/ChevronUp';
import ChevronDown from '@/components/atoms/svg/ChevronDown';
import { useEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Link from 'next/link';
import GuestPreview from '@/components/organisms/GuestPreview';
import ThemePicker from '@/components/molecules/ThemePicker';
import Sheet from '@/components/molecules/Sheet';
import { savedLabel, useAutosave, useDeleteEditorPhoto, useEditorInvitation, useUploadEditorPhoto } from '@/domain/editor/query';
import AccountFields from '@/components/molecules/AccountFields';
import ContactFields from '@/components/molecules/ContactFields';
import CoverFields from '@/components/molecules/CoverFields';
import DirectionFields from '@/components/molecules/DirectionFields';
import FamilyFields from '@/components/molecules/FamilyFields';
import GalleryFields from '@/components/molecules/GalleryFields';
import GreetingFields from '@/components/molecules/GreetingFields';
import RsvpFields from '@/components/molecules/RsvpFields';
import WhenNote from '@/components/molecules/WhenNote';
import {
  PREVIEW_DEBOUNCE_MS,
  fieldIssues,
  previewInvitation,
  sectionMark,
  type EditorDraft,
  type FieldIssue,
  type SectionId,
  type SectionMark,
} from '@/domain/editor';
import { formatCoverWhen } from '@/domain/dates';
import { draftFromInvitation } from '@/editor/document';

const sections: Array<{ id: SectionId; title: string }> = [
  { id: 'cover', title: '커버' },
  { id: 'greeting', title: '인사말' },
  { id: 'families', title: '혼주' },
  { id: 'contact', title: '연락하기' },
  { id: 'when', title: '일시' },
  { id: 'gallery', title: '사진' },
  { id: 'directions', title: '오시는 길' },
  { id: 'accounts', title: '마음 전하실 곳' },
  { id: 'rsvp', title: '참석 여부' },
];

const markName: Record<SectionMark, string> = {
  complete: '완료',
  required: '필수',
  error: '확인해 주세요',
  empty: '비어 있음, 초대장에서 숨겨져요',
};

interface EditorScreenProps { routeId: string }

const EditorScreen = ({ routeId }: EditorScreenProps) => {
  const [queries] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false }, mutations: { retry: false } } }),
  );
  return (
    <QueryClientProvider client={queries}>
      <EditorWorkspace routeId={routeId} />
    </QueryClientProvider>
  );
}

function EditorWorkspace({ routeId }: { routeId: string }) {
  const { id, ready } = useDraftId(routeId);
  const invitationQuery = useEditorInvitation(id, ready);
  const [draft, setDraft] = useState<EditorDraft | null>(null);
  const [missing, setMissing] = useState(false);
  const [open, setOpen] = useState<SectionId>('cover');
  const [wide, setWide] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [sheet, setSheet] = useState<'theme' | null>(null);
  const [dirtySinceLoad, setDirtySinceLoad] = useState(false);
  const [full, setFull] = useState(false);
  const [fullEnvelope, setFullEnvelope] = useState(true);
  const [liveEnvelope, setLiveEnvelope] = useState(false);
  const [frame, setFrame] = useState<'large' | 'small'>('large');
  const [lit, setLit] = useState<SectionId | null>(null);
  const [keyboard, setKeyboard] = useState(false);
  const [banner, setBanner] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const autosave = useAutosave(setDraft);
  const uploadPhoto = useUploadEditorPhoto();
  const deletePhoto = useDeleteEditorPhoto();
  const bindRef = useRef(autosave.bind);
  bindRef.current = autosave.bind;
  const previewDraft = useDebounced(draft, PREVIEW_DEBOUNCE_MS);

  const seeded = useRef<string | null>(null);

  useEffect(() => {
    try {
      if (localStorage.getItem('invife:editor:banner') === 'off') setBanner(false);
    } catch {
      /* 저장소를 못 읽어도 배너는 보여 준다 */
    }
  }, []);

  useEffect(() => {
    if (invitationQuery.isFetching) return;
    if (invitationQuery.isError || invitationQuery.data === null) {
      setMissing(true);
      return;
    }
    const loaded = invitationQuery.data;
    if (!loaded || seeded.current === loaded.id) return;
    seeded.current = loaded.id;
    const next = draftFromInvitation(loaded);
    setMissing(false);
    setDraft(next);
    bindRef.current(next, loaded);
  }, [invitationQuery.data, invitationQuery.isError, invitationQuery.isFetching]);

  useEffect(() => {
    const query = window.matchMedia('(min-width: 1440px)');
    const apply = () => setWide(query.matches);
    apply();
    query.addEventListener('change', apply);
    const viewport = window.visualViewport;
    const onResize = () => setKeyboard(Boolean(viewport && window.innerHeight - viewport.height > 120));
    viewport?.addEventListener('resize', onResize);
    const clock = window.setInterval(() => setNow(new Date()), 30_000);
    return () => {
      query.removeEventListener('change', apply);
      viewport?.removeEventListener('resize', onResize);
      window.clearInterval(clock);
    };
  }, []);

  useEffect(() => {
    const hash = window.location.hash.replace('#section-', '');
    if (sections.some((section) => section.id === hash)) setOpen(hash as SectionId);
  }, []);

  useEffect(() => {
    if (!lit) return;
    const timer = window.setTimeout(() => setLit(null), 1000);
    return () => window.clearTimeout(timer);
  }, [lit]);

  function change(next: EditorDraft, immediate = false) {
    setDraft(next);
    setDirtySinceLoad(true);
    autosave.touch(next);
    if (immediate) window.setTimeout(() => void autosave.flush(), 0);
  }

  function notify(text: string) {
    setNote(text);
    window.setTimeout(() => setNote((current) => (current === text ? null : current)), 3200);
  }

  if (missing) {
    return (
      <main className="app-root ed-page">
        <h1 className="ed-title">이 청첩장을 찾지 못했어요</h1>
        <Link className="ed-btn" href="/new/">새로 만들기</Link>
      </main>
    );
  }
  if (!draft || !previewDraft) {
    return (
      <main className="app-root ed-page">
        <p>초안을 불러오고 있어요</p>
      </main>
    );
  }

  const invitationId = draft.invitation.id;

  async function uploadFile(file: File) {
    return uploadPhoto.mutateAsync({
      invitationId,
      file,
      onServer: autosave.noteServer,
      onPhoto: autosave.notePhoto,
    });
  }

  async function removePhoto(photoId: string) {
    const invitation = await deletePhoto.mutateAsync({ invitationId, photoId });
    if (!invitation) return false;
    autosave.noteServer(invitation);
    return true;
  }

  const issues = fieldIssues(draft, now);
  const groom = draft.invitation.groom.name.trim();
  const bride = draft.invitation.bride.name.trim();
  const title = groom && bride ? `${groom} · ${bride}` : '새 청첩장';
  const preview = previewInvitation(previewDraft);
  const server = invitationQuery.data;
  const published = server?.status === 'published';
  const pendingChanges = Boolean(published && (server?.hasUnpublishedChanges || dirtySinceLoad));
  const publishHref = published && !pendingChanges ? `/edit/${invitationId}/published/` : `/edit/${invitationId}/publish/`;
  const publishText = published ? (pendingChanges ? '변경 사항 반영' : '공유') : '발행하기';

  return (
    <main className={`app-root ed-shell ${keyboard ? 'is-keyboard' : ''}`}>
      <header className="ed-top">
        <Link className="ed-icon-btn" href="/" aria-label="뒤로">
          <ArrowLeft />
        </Link>
        <h1>{title}</h1>
        <SaveStatus status={autosave.status} hold={autosave.holdSaved} now={now} onRetry={() => void autosave.flush()} />
        <Link className="ed-btn ed-publish" href={publishHref} onClick={() => setReveal(true)}>{publishText}</Link>
      </header>
      {banner ? (
        <p className="ed-banner">
          <Info size={18} />
          <span>다른 브라우저에서는 보이지 않아요. 발행할 때 카카오로 연결하면 어디서든 열 수 있어요.</span>
          <button type="button" className="ed-icon-btn" aria-label="안내 닫기" onClick={() => { setBanner(false); try { localStorage.setItem('invife:editor:banner', 'off'); } catch { /* 닫기만 한다 */ } }}>
            <Close size={18} />
          </button>
        </p>
      ) : null}
      {autosave.status.kind === 'error' && autosave.status.failures >= 3 ? (
        <p className="ed-banner is-error" role="alert">저장하지 못했어요. 다시 시도해 주세요.</p>
      ) : null}
      {autosave.conflict ? (
        <p className="ed-banner" role="alert">
          다른 곳에서 수정된 내용이 있어요.
          <button type="button" onClick={autosave.takeTheirs}>최신 내용 불러오기</button>
          <button type="button" onClick={autosave.keepMine}>이 화면 내용으로 덮어쓰기</button>
        </p>
      ) : null}
      <div className="ed-body">
        <nav className="ed-side" aria-label="섹션">
          {sections.map((section) => (
            <button key={section.id} type="button" className={open === section.id ? 'is-on' : ''} onClick={() => { setOpen(section.id); setLit(section.id); document.getElementById(`section-${section.id}`)?.scrollIntoView({ block: 'start' }); }}>
              {section.title}
            </button>
          ))}
        </nav>
        <form
          className="ed-form"
          onSubmit={(event) => event.preventDefault()}
          onBlur={() => void autosave.flush()}
        >
          <button type="button" className="ed-btn-secondary" onClick={() => setSheet('theme')}>
            <Palette size={18} /> 테마
          </button>
          {sections.map((section) => {
            const mark = sectionMark(section.id, issues, draft);
            const shown = wide || open === section.id;
            return (
              <section key={section.id} id={`section-${section.id}`} className="ed-section">
                <button
                  type="button"
                  className="ed-section-head"
                  aria-expanded={shown}
                  aria-controls={`panel-${section.id}`}
                  aria-label={`${section.title}, ${markName[mark]}`}
                  onClick={() => { setOpen(section.id); setLit(section.id); }}
                >
                  <span className="ed-section-copy">
                    <strong>{section.title}</strong>
                    <span>{summary(draft, section.id)}</span>
                  </span>
                  <Mark mark={mark} />
                  {shown ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
                {shown ? (
                  <div id={`panel-${section.id}`} className="ed-panel" onFocusCapture={() => setLit(section.id)}>
                    <SectionBody section={section.id} draft={draft} issues={issues} reveal={reveal} onChange={change} onMessage={notify} uploadFile={uploadFile} removePhoto={removePhoto} />
                  </div>
                ) : null}
              </section>
            );
          })}
        </form>
        <aside className="ed-preview-pane" aria-label="초대장 미리보기">
          <div className="ed-frame-tools">
            <button type="button" className="ed-btn-secondary" onClick={() => setFrame(frame === 'large' ? 'small' : 'large')}>
              <PhoneFrame size={18} /> {frame === 'large' ? '390×844' : '360×640'}
            </button>
            <button type="button" className="ed-btn-secondary" onClick={() => setLiveEnvelope(true)}>
              <Refresh size={18} /> 봉투 다시 보기
            </button>
            <button type="button" className="ed-btn-secondary" onClick={() => { setFullEnvelope(true); setLiveEnvelope(false); setFull(true); }}>크게 보기</button>
          </div>
          <Frame draft={previewDraft} preview={preview} framed size={frame} envelope={liveEnvelope} onEnvelopeDone={() => setLiveEnvelope(false)} lit={lit} />
        </aside>
      </div>
      <div className="ed-bottom">
        <button type="button" className="ed-btn-secondary" onClick={() => { setFullEnvelope(true); setLiveEnvelope(false); setFull(true); }}>
          <Eye size={18} /> 미리보기
        </button>
        <Link className="ed-btn" href={publishHref} onClick={() => setReveal(true)}>{publishText}</Link>
      </div>
      <button type="button" className="ed-btn ed-float" onClick={() => { setFullEnvelope(false); setFull(true); }}>
        <Eye size={18} /> 미리보기
      </button>
      {note ? <p className="ed-banner fixed left-4 right-4 bottom-20 z-[60]" role="status">{note}</p> : null}
      {full ? (
        <div className="ed-full" role="dialog" aria-modal="true" aria-label="미리보기">
          <div className="ed-full-bar">
            <strong>미리보기</strong>
            <button type="button" className="ed-btn-text" onClick={() => setFullEnvelope(true)}>봉투 다시 보기</button>
            <button type="button" className="ed-icon-btn" aria-label="미리보기 닫기" onClick={() => setFull(false)}>
              <Close />
            </button>
          </div>
          <div className="ed-full-body">
            <div className="ed-full-stage">
              <Frame draft={previewDraft} preview={preview} framed={false} size="large" envelope={fullEnvelope} onEnvelopeDone={() => setFullEnvelope(false)} lit={null} desktopFrame />
            </div>
          </div>
        </div>
      ) : null}
      {sheet === 'theme' ? (
        <Sheet title="색을 골라 주세요" onClose={() => setSheet(null)}>
          <ThemePicker value={draft.invitation.theme} onChange={(theme) => change({ ...draft, invitation: { ...draft.invitation, theme } })} />
          <p className="ed-caption">나중에 언제든 바꿀 수 있어요</p>
        </Sheet>
      ) : null}
    </main>
  );
}

function Frame({
  draft,
  preview,
  framed,
  size,
  envelope,
  onEnvelopeDone,
  lit,
  desktopFrame = false,
}: {
  draft: EditorDraft;
  preview: ReturnType<typeof previewInvitation>;
  framed: boolean;
  size: 'large' | 'small';
  envelope: boolean;
  onEnvelopeDone: () => void;
  lit: SectionId | null;
  desktopFrame?: boolean;
}) {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(min-width: 1024px)');
    const apply = () => setDesktop(query.matches);
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, []);
  const phone = framed || (desktopFrame && desktop);
  const hold = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const node = hold.current;
    if (!node || !phone) return;
    const width = size === 'large' ? 390 : 360;
    const height = size === 'large' ? 844 : 640;
    const apply = () => {
      const rect = node.getBoundingClientRect();
      const next = Math.min(1, (rect.width - 16) / width, (rect.height - 8) / height);
      setScale(Number.isFinite(next) ? Math.max(0.6, next) : 1);
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(node);
    return () => observer.disconnect();
  }, [desktop, phone, size]);
  const body = (
    <div data-tone={draft.photoTone}>
      <GuestPreview invitation={preview} framed={phone} envelope={envelope} onEnvelopeDone={onEnvelopeDone} lit={lit} />
    </div>
  );
  if (!phone) return body;
  const height = size === 'large' ? 844 : 640;
  return (
    <div className={`ed-frame-hold ${desktopFrame ? 'is-full' : ''}`} ref={hold}>
      <div
        className={`ed-frame is-fit ${size === 'small' ? 'is-small' : ''}`}
        style={{ '--frame-scale': String(scale), '--frame-drop': `${height * scale - height}px` }}
      >
        <div className="ed-frame-scroll">{body}</div>
      </div>
    </div>
  );
}

function SectionBody({
  section,
  draft,
  issues,
  reveal,
  onChange,
  onMessage,
  uploadFile,
  removePhoto,
}: {
  section: SectionId;
  draft: EditorDraft;
  issues: FieldIssue[];
  reveal: boolean;
  onChange: (draft: EditorDraft, immediate?: boolean) => void;
  onMessage: (text: string) => void;
  uploadFile: (file: File) => Promise<{ photo: import('@/domain/types').Photo } | { error: string }>;
  removePhoto: (id: string) => Promise<boolean>;
}) {
  const bag = { draft, issues, reveal, onChange };
  if (section === 'cover') return <CoverFields {...bag} />;
  if (section === 'greeting') return <GreetingFields {...bag} />;
  if (section === 'families') return <FamilyFields {...bag} />;
  if (section === 'contact') return <ContactFields {...bag} />;
  if (section === 'when') return <WhenNote />;
  if (section === 'gallery') {
    return <GalleryFields {...bag} onChange={(next) => onChange(next, true)} onMessage={onMessage} uploadFile={uploadFile} removePhoto={removePhoto} />;
  }
  if (section === 'directions') return <DirectionFields {...bag} />;
  if (section === 'accounts') return <AccountFields {...bag} onMessage={onMessage} />;
  return <RsvpFields {...bag} />;
}

function Mark({ mark }: { mark: SectionMark }) {
  if (mark === 'complete') return <span className="ed-badge is-ok"><CheckCircle size={16} /> 완료</span>;
  if (mark === 'required') return <span className="ed-badge is-warn">필수</span>;
  if (mark === 'error') return <span className="ed-badge is-err"><Alert size={16} /> 확인</span>;
  return <span className="ed-badge">비어 있음 · 초대장에서 숨겨져요</span>;
}

function SaveStatus({ status, hold, now, onRetry }: { status: ReturnType<typeof useAutosave>['status']; hold: boolean; now: Date; onRetry: () => void }) {
  if (status.kind === 'saving') return <p className="ed-save" aria-live="polite"><Spinner size={16} /> 저장 중…</p>;
  if (status.kind === 'offline') return <p className="ed-save" aria-live="polite"><CloudOff size={16} /> 오프라인 · 연결되면 저장해요</p>;
  if (status.kind === 'error') {
    return (
      <p className="ed-save is-error" aria-live="polite">
        <CloudOff size={16} /> 저장하지 못했어요 <button type="button" onClick={onRetry}>다시 시도</button>
      </p>
    );
  }
  const label = !status.at ? '저장됨' : hold ? '저장됨' : savedLabel(status.at, now);
  return <p className="ed-save" aria-live="polite"><CloudCheck size={16} /> {label}</p>;
}

function summary(draft: EditorDraft, section: SectionId): string {
  const invitation = draft.invitation;
  if (section === 'cover') {
    const names = [invitation.groom.name.trim(), invitation.bride.name.trim()].filter(Boolean).join(' · ');
    const when = /^\d{4}-\d{2}-\d{2}$/.test(invitation.ceremony.date) ? formatCoverWhen(invitation.ceremony.date, invitation.ceremony.time) : '';
    return [names, when, invitation.ceremony.venueName.trim()].filter(Boolean).join(' · ') || '이름과 예식 정보';
  }
  if (section === 'greeting') return invitation.greeting?.trim().split('\n')[0] || '비워 두면 숨겨져요';
  if (section === 'families') return '부모님 이름과 고인 표기';
  if (section === 'contact') return '전화번호';
  if (section === 'when') return '커버의 날짜로 자동으로 만들어져요';
  if (section === 'gallery') return `사진 ${invitation.photos.length} / 10`;
  if (section === 'directions') return invitation.ceremony.address?.split('\n')[0] || '주소';
  if (section === 'accounts') return `계좌 ${invitation.accounts.length}개`;
  return invitation.rsvp.deadline ? '응답 마감' : '예식 날짜를 고르면 전날 밤 12시로 맞춰져요';
}

function useDraftId(routeId: string): { id: string; ready: boolean } {
  const [id, setId] = useState(routeId);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const match = window.location.pathname.match(/\/edit\/([^/]+)/);
    if (match?.[1]) setId(decodeURIComponent(match[1]));
    setReady(true);
  }, [routeId]);
  return { id, ready };
}

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export default EditorScreen;
