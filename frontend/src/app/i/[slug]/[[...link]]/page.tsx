import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import { siteConfig } from '@/config';
import { InvitationView } from '@/components/invitation-view';
import { getGuestDataSource } from '@/data';
import { isEventEnded, ogDescription } from '@/domain/dates';
import { guestPath, parseLink, resolveGuestView } from '@/domain/links';
import type { ThemeId } from '@/domain/types';
import { absoluteUrl } from '@/env';

const themeColor: Record<ThemeId, string> = {
  ivory: '#F4EFE6',
  sage: '#ECEEE7',
  mist: '#ECEDEF',
};

type Params = { slug: string; link?: string[] };

export async function generateStaticParams() {
  return getGuestDataSource().listStaticParams();
}

export const dynamicParams = false;

async function load(params: Params) {
  const link = parseLink(params.link);
  if (!link) return null;
  const record = await getGuestDataSource().getRecord(params.slug);
  if (!record) return null;
  const view = resolveGuestView(record, link);
  if (!view) return null;
  return { record, view, link };
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const loaded = await load(await params);
  if (!loaded) return { title: '초대장을 찾을 수 없어요', robots: { index: false, follow: false } };
  const { invitation } = loaded.record;
  const title = `${invitation.groom.name} · ${invitation.bride.name} 결혼식에 초대합니다`;
  const description = ogDescription(invitation);
  const image = absoluteUrl(`/og/${invitation.slug}.jpg`);
  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: {
      title: `${invitation.groom.name} · ${invitation.bride.name} 결혼합니다`,
      description,
      url: absoluteUrl(guestPath(invitation.slug, loaded.link)),
      images: [{ url: image, width: 1200, height: 600, type: 'image/jpeg' }],
    },
  };
}

export async function generateViewport({ params }: { params: Promise<Params> }): Promise<Viewport> {
  const loaded = await load(await params);
  return {
    themeColor: themeColor[loaded?.record.invitation.theme ?? 'ivory'],
    colorScheme: 'light',
  };
}

export default async function InvitationPage({ params }: { params: Promise<Params> }) {
  const loaded = await load(await params);
  if (!loaded) notFound();
  const { invitation } = loaded.record;
  const generatedAt = new Date().toISOString();
  const ended = isEventEnded(new Date(generatedAt), invitation.ceremony.date, siteConfig.endedEventAt);
  const bootstrap = `try{var k='invife:opened:'+${JSON.stringify(invitation.id)};var reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;var opened=localStorage.getItem(k);if(opened||reduce){document.documentElement.dataset.envelope='skip';if(reduce&&!opened)localStorage.setItem(k,'1')}else{document.documentElement.dataset.envelope='show'}}catch(e){document.documentElement.dataset.envelope='show'}`;
  return (
    <>
      {ended ? null : <script dangerouslySetInnerHTML={{ __html: bootstrap }} />}
      <InvitationView
        invitation={invitation}
        view={loaded.view}
        mode={loaded.record.rsvpMode ?? 'ok'}
        generatedAt={generatedAt}
      />
    </>
  );
}
