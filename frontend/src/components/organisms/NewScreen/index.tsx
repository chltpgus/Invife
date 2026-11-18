'use client';

import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { kstToday } from '@/domain/editor';
import { useCreateInvitation } from '@/domain/editor/query';
import { isTheme } from '@/editor/themes';
import type { ThemeId } from '@/domain/types';
import ThemePicker from '@/components/molecules/ThemePicker';

const NewScreen = () => {
  const [queries] = useState(() => new QueryClient({ defaultOptions: { mutations: { retry: false } } }));
  return (
    <QueryClientProvider client={queries}>
      <NewForm />
    </QueryClientProvider>
  );
}

function NewForm() {
  const [theme, setTheme] = useState<ThemeId>('ivory');
  const [groomName, setGroomName] = useState('');
  const [brideName, setBrideName] = useState('');
  const [ceremonyDate, setCeremonyDate] = useState('');
  const [ceremonyTime, setCeremonyTime] = useState('');
  const [error, setError] = useState('');
  const today = kstToday(new Date());
  const createInvitation = useCreateInvitation();

  useEffect(() => {
    document.title = '색을 골라 주세요 · Invife';
    const theme = new URLSearchParams(window.location.search).get('theme') ?? undefined;
    if (isTheme(theme)) setTheme(theme);
  }, []);

  async function start(skip = false) {
    setError('');
    try {
      const invitation = await createInvitation.mutateAsync({
        theme,
        groomName: skip || !groomName.trim() ? undefined : groomName.trim(),
        brideName: skip || !brideName.trim() ? undefined : brideName.trim(),
        ceremonyDate: skip || !ceremonyDate ? undefined : ceremonyDate,
        ceremonyTime: skip || !ceremonyTime ? undefined : ceremonyTime.slice(0, 5),
      });
      window.location.assign(`/edit/${invitation.id}/`);
    } catch {
      setError('잠시 후 다시 시도해 주세요');
    }
  }

  return (
    <main className="app-root">
      <div className="ed-page">
        <p className="ed-kicker">Invife</p>
        <h1 className="ed-title">색을 골라 주세요</h1>
        <p className="ed-caption">나중에 언제든 바꿀 수 있어요</p>
        <div className="ed-stack">
          <ThemePicker value={theme} onChange={setTheme} />
          <label className="ed-field">
            신랑 이름
            <input value={groomName} maxLength={10} onChange={(event) => setGroomName(event.target.value)} />
          </label>
          <label className="ed-field">
            신부 이름
            <input value={brideName} maxLength={10} onChange={(event) => setBrideName(event.target.value)} />
          </label>
          <div className="ed-row">
            <label className="ed-field">
              예식 날짜
              <input type="date" min={today} value={ceremonyDate} onChange={(event) => setCeremonyDate(event.target.value)} />
            </label>
            <label className="ed-field">
              예식 시간
              <input type="time" step={600} value={ceremonyTime} onChange={(event) => setCeremonyTime(event.target.value)} />
            </label>
          </div>
          <p className="ed-caption">비워 두어도 시작할 수 있어요. 미리보기에는 안내 문구가 들어가요.</p>
          {error ? <p className="ed-error" role="alert">{error}</p> : null}
          <button type="button" className="ed-btn ed-wide" disabled={createInvitation.isPending} onClick={() => void start(false)}>
            {createInvitation.isPending ? '만들고 있어요…' : '만들기 시작'}
          </button>
          <button type="button" className="ed-btn-text" disabled={createInvitation.isPending} onClick={() => void start(true)}>
            건너뛰고 시작
          </button>
        </div>
      </div>
    </main>
  );
}

export default NewScreen;
