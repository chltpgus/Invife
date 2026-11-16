'use client';

import { useState } from 'react';
import { useToast } from '@/components/toast';
import { ogDescription } from '@/domain/dates';
import type { Invitation } from '@/domain/types';
import { absoluteUrl, env } from '@/env';

export function ShareButton({ invitation }: { invitation: Invitation }) {
  const notify = useToast();
  const [pending, setPending] = useState(false);
  const enabled = Boolean(env.kakaoJavaScriptKey);
  const pageUrl = absoluteUrl(`/i/${invitation.slug}/`);

  async function share() {
    if (!enabled || pending) return;
    setPending(true);
    try {
      await loadKakao(env.kakaoJavaScriptKey);
      const kakao = window.Kakao;
      if (!kakao) throw new Error('kakao');
      if (!kakao.isInitialized()) kakao.init(env.kakaoJavaScriptKey);
      kakao.Share.sendDefault({
        objectType: 'feed',
        content: {
          title: `${invitation.groom.name} · ${invitation.bride.name} 결혼합니다`,
          description: ogDescription(invitation),
          imageUrl: absoluteUrl(`/og/${invitation.slug}.jpg`),
          imageWidth: 800,
          imageHeight: 400,
          link: { mobileWebUrl: pageUrl, webUrl: pageUrl },
        },
        buttons: [{ title: '청첩장 보기', link: { mobileWebUrl: pageUrl, webUrl: pageUrl } }],
      });
    } catch {
      notify('공유하지 못했어요', 'err');
    } finally {
      setPending(false);
    }
  }

  return (
    <p className="share-row">
      <button type="button" className="btn-text" disabled={!enabled || pending} aria-disabled={!enabled || pending} onClick={() => void share()}>
        카카오톡으로 공유
      </button>
    </p>
  );
}

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

declare global {
  interface Window {
    Kakao?: {
      init: (key: string) => void;
      isInitialized: () => boolean;
      Share: {
        sendDefault: (payload: {
          objectType: 'feed';
          content: {
            title: string;
            description: string;
            imageUrl: string;
            imageWidth: number;
            imageHeight: number;
            link: { mobileWebUrl: string; webUrl: string };
          };
          buttons: Array<{ title: string; link: { mobileWebUrl: string; webUrl: string } }>;
        }) => void;
      };
    };
  }
}
