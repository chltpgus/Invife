'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useRef, useState, type MouseEvent, type ReactNode, type RefObject } from 'react';
import { Accounts } from '@/components/accounts';
import { Cover } from '@/components/cover';
import { Directions } from '@/components/directions';
import { Envelope } from '@/components/envelope';
import { Gallery } from '@/components/gallery';
import { RsvpSection } from '@/components/rsvp-section';
import { ShareButton } from '@/components/share-button';
import { Story } from '@/components/story';
import { ToastProvider, useToast } from '@/components/toast';
import { When } from '@/components/when';
import type { SectionId } from '@/domain/editor';
import type { Invitation, Side } from '@/domain/types';

const anchor: Record<SectionId, string> = {
  cover: 'cover',
  greeting: 'greeting',
  families: 'parents',
  contact: 'contact',
  when: 'when',
  gallery: 'gallery',
  directions: 'directions',
  accounts: 'accounts',
  rsvp: 'rsvp',
};

export function GuestPreview({
  invitation,
  framed,
  envelope,
  onEnvelopeDone,
  lit,
}: {
  invitation: Invitation;
  framed: boolean;
  envelope: boolean;
  onEnvelopeDone: () => void;
  lit: SectionId | null;
}) {
  const [queries] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false }, mutations: { retry: false } },
      }),
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const [viewer, setViewer] = useState<number | null>(null);
  const [accountsOpen, setAccountsOpen] = useState<Record<Side, boolean>>({ groom: false, bride: false });
  const deadlineOk = !Number.isNaN(new Date(invitation.rsvp.deadline).getTime());

  useEffect(() => {
    if (!envelope) return;
    document.documentElement.dataset.envelope = 'show';
    return () => {
      delete document.documentElement.dataset.envelope;
    };
  }, [envelope]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.querySelectorAll('.is-lit').forEach((node) => node.classList.remove('is-lit'));
    if (!lit) return;
    const node = root.querySelector<HTMLElement>(`#${anchor[lit]}`);
    if (!node) return;
    node.classList.add('is-lit');
    node.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [lit, invitation]);

  return (
    <QueryClientProvider client={queries}>
      <ToastProvider lift={false}>
        <PreviewSurface framed={framed} theme={invitation.theme} rootRef={rootRef}>
          {envelope ? (
            <Envelope
              invitation={invitation}
              onDone={() => {
                document.documentElement.dataset.envelope = 'done';
                onEnvelopeDone();
              }}
            />
          ) : null}
          <Cover invitation={invitation} preview />
          <Story invitation={invitation} preview />
          <When invitation={invitation} />
          <Gallery photos={invitation.photos} index={viewer} onIndex={setViewer} />
          <Directions invitation={invitation} />
          <Accounts
            note={invitation.accountsNote}
            accounts={invitation.accounts}
            open={accountsOpen}
            onToggle={(side) => setAccountsOpen((current) => ({ ...current, [side]: !current[side] }))}
          />
          {deadlineOk ? <RsvpSection invitation={invitation} link={{ channel: 'invite' }} hasContact={false} onMissing={() => undefined} /> : null}
          <ShareButton invitation={invitation} />
        </PreviewSurface>
      </ToastProvider>
    </QueryClientProvider>
  );
}

function PreviewSurface({
  framed,
  theme,
  rootRef,
  children,
}: {
  framed: boolean;
  theme: Invitation['theme'];
  rootRef: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  const notify = useToast();
  return (
    <div ref={rootRef} className={`column ${framed ? 'phone-screen' : ''}`} data-theme={theme} onClickCapture={(event) => guardPreview(event, notify)}>
      <div className="live-invite">{children}</div>
    </div>
  );
}

function guardPreview(event: MouseEvent, notify: (text: string, tone?: 'ok' | 'err') => void) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest('.envelope-screen, #gallery, .viewer, .accordion-head')) return;
  if (!target.closest('a, button')) return;
  event.preventDefault();
  event.stopPropagation();
  notify('미리보기에서는 보내지지 않아요');
}
