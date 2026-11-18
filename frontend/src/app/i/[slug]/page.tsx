import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import { siteConfig } from '@/config';
import InvitationView from '@/components/organisms/InvitationView';
import { getGuestDataSource } from '@/data';
import { ogDescription, resolveEndedAt } from '@/domain/dates';
import { guestPath } from '@/domain/links';
import type { ThemeId } from '@/domain/types';
import { absoluteUrl } from '@/env';

const themeColor: Record<ThemeId, string> = {
  ivory: '#F4EFE6',
  sage: '#ECEEE7',
  mist: '#ECEDEF',
};

type Params = { slug: string };

export async function generateStaticParams() {
  return getGuestDataSource().listStaticParams();
}

export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const invitation = await getGuestDataSource().getInvitation(slug);
  if (!invitation) return { title: '초대장을 찾을 수 없어요', robots: { index: false, follow: false }, referrer: 'no-referrer' };
  const title = `${invitation.groom.name} · ${invitation.bride.name} 결혼식에 초대합니다`;
  const description = ogDescription(invitation);
  const image = absoluteUrl(`/og/${invitation.slug}.jpg`);
  return {
    title,
    description,
    referrer: 'no-referrer',
    robots: { index: false, follow: false },
    openGraph: {
      title: `${invitation.groom.name} · ${invitation.bride.name} 결혼합니다`,
      description,
      url: absoluteUrl(guestPath(invitation.slug)),
      images: [{ url: image, width: 1200, height: 600, type: 'image/jpeg' }],
    },
  };
}

export async function generateViewport({ params }: { params: Promise<Params> }): Promise<Viewport> {
  const { slug } = await params;
  const invitation = await getGuestDataSource().getInvitation(slug);
  return {
    themeColor: themeColor[invitation?.theme ?? 'ivory'],
    colorScheme: 'light',
  };
}

export default async function InvitationPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const invitation = await getGuestDataSource().getInvitation(slug);
  if (!invitation) notFound();
  const endedAt = resolveEndedAt(invitation.ceremony.date, siteConfig.endedEventAt).toISOString();
  const bootstrap = `try{var path=location.pathname.replace(/\\/+$/,'');if(/^\\/i\\/[^/]+\\/(?:g|s)\\/[^/]+$/.test(path))document.documentElement.dataset.gate='pending';var k='invife:opened:'+${JSON.stringify(slug)};var ended=Date.now()>=Date.parse(${JSON.stringify(endedAt)});if(ended){document.documentElement.dataset.ended='1'}else{var reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;var opened=localStorage.getItem(k);if(opened||reduce){document.documentElement.dataset.envelope='skip';if(reduce&&!opened)localStorage.setItem(k,'1')}else{document.documentElement.dataset.envelope='show'}}}catch(e){document.documentElement.dataset.envelope='show'}`;
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: bootstrap }} />
      <InvitationView invitation={invitation} />
    </>
  );
}
