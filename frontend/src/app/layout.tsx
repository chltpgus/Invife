import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { env } from '@/env';
import './globals.css';

function contentSecurityPolicy(): string {
  const connect = ["'self'", 'https://dapi.kakao.com', 'https://*.kakao.com', 'https://*.daumcdn.net', 'https://kauth.kakao.com', 'https://kapi.kakao.com'];
  const images = ["'self'", 'data:', 'blob:', 'https://*.daumcdn.net', 'https://*.kakaocdn.net', 'https://dapi.kakao.com'];
  for (const value of [env.apiBaseUrl, env.r2BaseUrl]) {
    if (!value) continue;
    try {
      const origin = new URL(value).origin;
      connect.push(origin);
      images.push(origin);
    } catch {
      /* 잘못된 URL 은 CSP 에 넣지 않는다 */
    }
  }
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
    "script-src 'self' 'unsafe-inline' https://dapi.kakao.com https://t1.kakaocdn.net https://challenges.cloudflare.com",
    "style-src 'self' 'unsafe-inline'",
    `img-src ${images.join(' ')}`,
    `connect-src ${connect.join(' ')}`,
    "font-src 'self'",
    'frame-src https://challenges.cloudflare.com',
  ].join('; ');
}

export const metadata: Metadata = {
  metadataBase: new URL(env.siteUrl),
  title: 'Invife',
  robots: { index: false, follow: false },
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: '/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  colorScheme: 'light',
  themeColor: '#F4EFE6',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" data-theme="ivory" suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="only light" />
        <meta httpEquiv="Content-Security-Policy" content={contentSecurityPolicy()} />
        <link rel="preload" href="/fonts/noto-serif-kr-400.woff2" as="font" type="font/woff2" crossOrigin="" />
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(!matchMedia('(prefers-reduced-motion: reduce)').matches)document.documentElement.dataset.motion='on'}catch(e){}",
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
