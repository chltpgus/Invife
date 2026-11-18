'use client';

import { useState } from 'react';
import { absoluteUrl, env } from '@/env';

interface KakaoShareProps {
  title?: string;
  description?: string;
  imageUrl?: string;
  pageUrl?: string;
  label?: string;
  compact?: boolean;
}

const KakaoShare = ({ title = '', description = '', imageUrl = '', pageUrl = '', label = '카카오톡으로 보내기', compact = false }: KakaoShareProps) => {
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState('');
  const enabled = Boolean(env.kakaoJavaScriptKey && pageUrl);

  async function share() {
    if (!enabled || pending) return;
    setPending(true);
    setNote('');
    try {
      await loadKakao(env.kakaoJavaScriptKey);
      const kakao = window.Kakao;
      if (!kakao) throw new Error('kakao');
      if (!kakao.isInitialized()) kakao.init(env.kakaoJavaScriptKey);
      const link = { mobileWebUrl: pageUrl, webUrl: pageUrl };
      kakao.Share.sendDefault({
        objectType: 'feed',
        content: {
          title,
          description,
          imageUrl: imageUrl || absoluteUrl('/icon-512.png'),
          imageWidth: 800,
          imageHeight: 400,
          link,
        },
        buttons: [{ title: '청첩장 보기', link }],
      });
    } catch {
      setNote('공유하지 못했어요');
    } finally {
      setPending(false);
    }
  }

  return (
    <span className={compact ? 'inline-flex flex-col' : 'block'}>
      <button type="button" className={compact ? 'ed-kakao ed-kakao-mini' : 'ed-kakao'} disabled={!enabled || pending} aria-disabled={!enabled || pending} onClick={() => void share()}>
        {pending ? '보내는 중…' : label}
      </button>
      {note ? <span className="ed-caption" role="alert">{note}</span> : null}
    </span>
  );
};

async function loadKakao(key: string) {
  if (window.Kakao || !key) return;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.5/kakao.min.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('kakao script'));
    document.body.appendChild(script);
  });
}

export default KakaoShare;
