'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import Accounts from '@/components/molecules/Accounts';
import Cover from '@/components/molecules/Cover';
import Directions from '@/components/molecules/Directions';
import EndedView from '@/components/molecules/EndedView';
import NotFoundView from '@/components/molecules/NotFoundView';
import Envelope from '@/components/molecules/Envelope';
import Gallery from '@/components/molecules/Gallery';
import QuickNav, { type NavItem } from '@/components/molecules/QuickNav';
import RsvpSection from '@/components/organisms/RsvpSection';
import ShareButton from '@/components/molecules/ShareButton';
import Story from '@/components/molecules/Story';
import ToastProvider from '@/components/molecules/Toast';
import When from '@/components/molecules/When';
import { parseGuestPath } from '@/domain/links';
import type { Invitation } from '@/domain/types';
import { sectionFlags } from '@/domain/visibility';

interface InvitationViewProps { invitation: Invitation }

const InvitationView = ({ invitation }: InvitationViewProps) => {
  const [queries] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, refetchOnWindowFocus: false, staleTime: Infinity },
          mutations: { retry: false },
        },
      }),
  );
  const pathname = usePathname();
  const link = parseGuestPath(pathname, invitation.slug);
  const [ended, setEnded] = useState(false);
  const [viewer, setViewer] = useState<number | null>(null);
  const [envelope, setEnvelope] = useState(true);
  const [navOn, setNavOn] = useState(false);
  const [current, setCurrent] = useState('');
  const [keyboard, setKeyboard] = useState(false);
  const [accountsOpen, setAccountsOpen] = useState({ groom: false, bride: false });
  const [missing, setMissing] = useState(false);
  const [gateReady, setGateReady] = useState(false);
  const markMissing = useCallback(() => setMissing(true), []);
  const releaseGate = useCallback(() => {
    const root = document.documentElement;
    if (root.dataset.gate !== 'pending') return;
    setEnvelope(root.dataset.envelope === 'show');
    setEnded(root.dataset.ended === '1');
    setGateReady(true);
  }, []);
  const flags = sectionFlags(invitation);

  useEffect(() => {
    const root = document.documentElement;
    if (root.dataset.gate === 'pending') return;
    setEnded(root.dataset.ended === '1');
    setEnvelope(root.dataset.envelope === 'show');
  }, []);

  useEffect(() => {
    if (!gateReady && !missing) return;
    delete document.documentElement.dataset.gate;
  }, [gateReady, missing]);

  useEffect(() => {
    const cover = document.getElementById('cover');
    if (!cover) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        setNavOn(entry.intersectionRatio < 0.2);
      },
      { threshold: [0, 0.2, 0.8, 1] },
    );
    observer.observe(cover);
    return () => observer.disconnect();
  }, [ended, link]);

  useEffect(() => {
    const nodes = ['directions', 'accounts', 'rsvp']
      .map((id) => document.getElementById(id))
      .filter((node): node is HTMLElement => Boolean(node));
    if (nodes.length === 0) return;
    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) visible.set(entry.target.id, entry.intersectionRatio);
        const next = [...visible.entries()].sort((a, b) => b[1] - a[1])[0];
        if (next && next[1] > 0) setCurrent(next[0]);
      },
      { threshold: [0.2, 0.4, 0.6], rootMargin: '-20% 0px -40% 0px' },
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [ended, link]);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const onResize = () => setKeyboard(window.innerHeight - viewport.height > 120);
    viewport.addEventListener('resize', onResize);
    return () => viewport.removeEventListener('resize', onResize);
  }, []);

  const items: NavItem[] = [];
  if (flags.directions) items.push({ id: 'directions', label: '오시는 길' });
  if (flags.accounts) items.push({ id: 'accounts', label: '마음 전하실 곳' });
  items.push({ id: 'rsvp', label: '참석 여부' });
  const showNav = navOn && viewer === null && !envelope && !keyboard && items.length > 0;

  let body: ReactNode;
  if (!link || missing) body = <NotFoundView />;
  else if (ended) body = <EndedView invitation={invitation} />;
  else
    body = (
    <>
      <div className="ended-before">
        <EndedView invitation={invitation} />
      </div>
      <div className="live-invite">
        <ToastProvider lift={showNav}>
          <div className={`column ${showNav ? 'has-nav' : ''}`} data-theme={invitation.theme}>
            {envelope ? <Envelope invitation={invitation} onDone={() => setEnvelope(false)} /> : null}
            <Cover invitation={invitation} />
            <Story invitation={invitation} />
            <When invitation={invitation} />
            <Gallery photos={invitation.photos} index={viewer} onIndex={setViewer} />
            <Directions invitation={invitation} />
            <Accounts
              note={invitation.accountsNote}
              accounts={invitation.accounts}
              open={accountsOpen}
              onToggle={(side) => setAccountsOpen((currentOpen) => ({ ...currentOpen, [side]: !currentOpen[side] }))}
            />
            <RsvpSection invitation={invitation} link={link} hasContact={flags.contact} onMissing={markMissing} onResolved={releaseGate} />
            <ShareButton invitation={invitation} />
          </div>
          <QuickNav
            items={items}
            current={current}
            visible={showNav}
            onAccounts={() => setAccountsOpen({ groom: true, bride: true })}
          />
        </ToastProvider>
      </div>
    </>
    );

  return <QueryClientProvider client={queries}>{body}</QueryClientProvider>;
}

export default InvitationView;
