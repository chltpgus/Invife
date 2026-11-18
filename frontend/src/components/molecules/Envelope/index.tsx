'use client';
import ArrowUp from '@/components/atoms/svg/ArrowUp';
import { useRef } from 'react';
import { eyebrows } from '@/content/copy';
import { formatEnvelopeDate } from '@/domain/dates';
import type { Invitation } from '@/domain/types';
import { resolveAssetUrl } from '@/env';

const storageKey = (slug: string) => `invife:opened:${slug}`;

interface EnvelopeProps { invitation: Invitation; onDone: () => void; preview?: boolean }

const Envelope = ({ invitation, onDone, preview = false }: EnvelopeProps) => {
  const root = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const playing = useRef(false);
  const swiped = useRef(false);
  const point = useRef<{ x: number; y: number; t: number } | null>(null);
  const photo = invitation.photos[0];
  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(invitation.ceremony.date);
  const when = dateOk ? formatEnvelopeDate(invitation.ceremony.date) : preview ? <span className="sample-text">예식 날짜</span> : null;
  const groom = invitation.groom.name.trim();
  const bride = invitation.bride.name.trim();

  function remember() {
    try {
      localStorage.setItem(storageKey(invitation.slug), '1');
    } catch {
      /* 저장할 수 없어도 연출은 끝낸다 */
    }
  }

  function finish(skip: boolean) {
    remember();
    const screen = root.current;
    if (!screen) {
      document.documentElement.dataset.envelope = 'done';
      onDone();
      return;
    }
    if (skip) screen.classList.add('is-leaving');
    window.setTimeout(() => {
      document.documentElement.dataset.envelope = 'done';
      onDone();
    }, skip ? 200 : 0);
  }

  async function play() {
    if (playing.current) {
      finish(true);
      return;
    }
    playing.current = true;
    root.current?.classList.add('is-playing');
    await wait(1100);
    const node = card.current;
    node?.getAnimations().forEach((animation) => animation.cancel());
    const target = document.querySelector('.cover-photo');
    if (!node || !(target instanceof HTMLElement)) {
      finish(false);
      return;
    }
    const from = node.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    node.style.position = 'fixed';
    node.style.margin = '0';
    node.style.zIndex = '5';
    const animation = node.animate(
      [
        { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px` },
        { left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px` },
      ],
      { duration: 700, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', fill: 'forwards' },
    );
    try {
      await animation.finished;
    } catch {
      /* 건너뛰기 */
    }
    finish(false);
  }

  return (
    <div className="envelope-screen" ref={root}>
      <div className="envelope-inner">
        <button type="button" className="btn-text envelope-skip" onClick={() => finish(true)}>
          건너뛰기
        </button>
        <p className="eyebrow" aria-hidden="true">
          {eyebrows.cover}
        </p>
        <p className="display-name">
          {preview && !groom ? <span className="sample-text">신랑 이름</span> : groom}
          <span aria-hidden="true"> · </span>
          {preview && !bride ? <span className="sample-text">신부 이름</span> : bride}
        </p>
        <button
          type="button"
          className="envelope"
          aria-label="초대장 열기"
          onClick={() => {
            if (swiped.current) {
              swiped.current = false;
              return;
            }
            void play();
          }}
          onKeyDown={(event) => {
            if (event.repeat) event.preventDefault();
          }}
          onPointerDown={(event) => {
            point.current = { x: event.clientX, y: event.clientY, t: performance.now() };
          }}
          onPointerUp={(event) => {
            const start = point.current;
            point.current = null;
            if (!start) return;
            const dx = event.clientX - start.x;
            const dy = start.y - event.clientY;
            if (Math.abs(dx) > Math.abs(dy)) return;
            const velocity = dy / Math.max(1, performance.now() - start.t);
            if (dy >= 48 || velocity >= 0.3) {
              swiped.current = true;
              void play();
            }
          }}
        >
          <span className="monogram" aria-hidden="true">
            {invitation.groom.givenName.slice(0, 1)}
            {invitation.bride.givenName.slice(0, 1)}
          </span>
          <svg className="env-layer back" viewBox="0 0 300 200" aria-hidden="true">
            <rect x="0.75" y="0.75" width="298.5" height="198.5" />
          </svg>
          <svg className="env-layer flap-open" viewBox="0 -111.25 300 112" aria-hidden="true">
            <path d="M0.75 0.75H299.25L150 -110.5Z" />
          </svg>
          <span className="env-card" ref={card}>
            {photo ? (
              <img
                alt=""
                src={resolveAssetUrl(photo.src.w800)}
                style={{ objectPosition: `${photo.focal.x * 100}% ${photo.focal.y * 100}%` }}
              />
            ) : (
              <span className="env-fallback">{when}</span>
            )}
          </span>
          <svg className="env-layer pocket" viewBox="0 0 300 200" aria-hidden="true">
            <path d="M0.75 0.75L150 104L299.25 0.75V199.25H0.75Z" />
          </svg>
          <svg className="env-layer flap-closed" viewBox="0 0 300 200" aria-hidden="true">
            <path d="M0.75 0.75H299.25L150 112Z" />
          </svg>
        </button>
        <p className="envelope-date">{when}</p>
        <p className="caption envelope-hint">
          <ArrowUp size={18} />
          탭하거나 위로 밀어서 열기
        </p>
      </div>
    </div>
  );
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export default Envelope;
