import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { contentSecurityPolicy } from '@/csp';
import { env } from '@/env';
import './globals.css';

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
