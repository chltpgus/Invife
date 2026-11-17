'use client';

import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { createEditorClient } from '@/editor/create-client';
import { themeSample } from '@/editor/themes';
import { Cover } from '@/components/cover';
import { Sheet } from '@/components/editor/ui';

export function StartScreen({ samples }: { samples: Array<{ slug: string; label: string }> }) {
  const [queries] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } }),
  );
  return (
    <QueryClientProvider client={queries}>
      <StartBody samples={samples} />
    </QueryClientProvider>
  );
}

function StartBody({ samples }: { samples: Array<{ slug: string; label: string }> }) {
  const [soon, setSoon] = useState(false);
  const drafts = useQuery({
    queryKey: ['editor-invitations'],
    queryFn: () => createEditorClient().listInvitations().catch(() => []),
  });
  useEffect(() => {
    document.title = 'Invife';
  }, []);
  const latest = drafts.data?.[0];
  return (
    <main className="app-root">
      <div className="ed-page">
        <div className="ed-start">
          <div>
            <p className="ed-kicker">Invife</p>
            <h1 className="ed-title">누가 만들어도 잡지 화보처럼</h1>
            {latest ? (
              <article className="ed-card" style={{ marginTop: 20 }}>
                <h2 className="ed-title">만들던 청첩장 이어서 하기</h2>
                <p className="ed-caption">{[latest.groomName, latest.brideName].filter(Boolean).join(' · ') || '새 청첩장'}</p>
                <a className="ed-btn ed-wide" href={`/edit/${latest.id}/`}>이어서 만들기</a>
              </article>
            ) : null}
            <div className="ed-samples" aria-label="테마 샘플">
              {(['ivory', 'sage', 'mist'] as const).map((theme) => (
                <Link key={theme} href="/new/" className="ed-mini" aria-label={themeSample(theme).theme}>
                  <span className="ed-mini-scale">
                    <Cover invitation={themeSample(theme)} />
                  </span>
                </Link>
              ))}
            </div>
            <div className="ed-stack">
              <Link className="ed-btn ed-wide" href="/new/">무료로 만들기</Link>
              <button type="button" className="ed-btn-text" onClick={() => setSoon(true)}>이미 만든 청첩장 보기</button>
              <p className="ed-caption">로그인 없이 시작하고, 발행할 때 카카오로 저장해요</p>
            </div>
          </div>
          <div className="ed-start-phone" aria-hidden="true">
            <div className="ed-frame">
              <div className="ed-frame-scroll phone-screen column">
                <Cover invitation={themeSample('ivory')} />
              </div>
            </div>
          </div>
        </div>
        <h2 className="ed-title" style={{ marginTop: 32 }}>샘플 초대장</h2>
        <ul className="ed-link-list">
          {samples.map((sample) => (
            <li key={sample.slug}>
              <Link href={`/i/${sample.slug}/`}>{sample.label}</Link>
            </li>
          ))}
        </ul>
      </div>
      {soon ? (
        <Sheet title="카카오 로그인" onClose={() => setSoon(false)}>
          <p>카카오 로그인과 내 초대장 목록은 다음 단계에서 열려요.</p>
          <button type="button" className="ed-btn" onClick={() => setSoon(false)}>닫기</button>
        </Sheet>
      ) : null}
    </main>
  );
}
