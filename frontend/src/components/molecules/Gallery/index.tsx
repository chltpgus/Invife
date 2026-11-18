'use client';
import ImageOff from '@/components/atoms/svg/ImageOff';
import Close from '@/components/atoms/svg/Close';
import ChevronLeft from '@/components/atoms/svg/ChevronLeft';
import ChevronRight from '@/components/atoms/svg/ChevronRight';
import { useEffect, useRef, useState } from 'react';
import { eyebrows } from '@/content/copy';
import Reveal from '@/components/atoms/Reveal';
import type { Photo } from '@/domain/types';
import { resolveAssetUrl } from '@/env';

interface GalleryProps {
  photos: Photo[];
  index: number | null;
  onIndex: (index: number | null) => void;
}

const Gallery = ({
  photos,
  index,
  onIndex,
}: GalleryProps) => {
  if (photos.length === 0) return null;
  const [lead, ...rest] = photos;
  return (
    <section className="section" id="gallery" aria-labelledby="gallery-title">
      <Reveal>
        <p className="eyebrow" aria-hidden="true">
          {eyebrows.gallery}
        </p>
        <h2 id="gallery-title" className="heading">
          갤러리
        </h2>
      </Reveal>
      <div className="gallery-grid">
        {lead ? <Thumb photo={lead} label={`웨딩 사진 1/${photos.length}`} sizes="(max-width: 430px) calc(100vw - 48px), 382px" lead onOpen={() => onIndex(0)} /> : null}
        {rest.length > 0 ? (
          <div className="thumbs">
            {rest.map((photo, offset) => (
              <Thumb
                key={photo.id}
                photo={photo}
                label={`웨딩 사진 ${offset + 2}/${photos.length}`}
                sizes="33vw"
                onOpen={() => onIndex(offset + 1)}
              />
            ))}
          </div>
        ) : null}
      </div>
      <p className="caption">사진을 누르면 크게 볼 수 있어요</p>
      {index !== null ? <Viewer photos={photos} start={index} onClose={() => onIndex(null)} /> : null}
    </section>
  );
}

function Thumb({
  photo,
  label,
  sizes,
  lead = false,
  onOpen,
}: {
  photo: Photo;
  label: string;
  sizes: string;
  lead?: boolean;
  onOpen: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const position = `${photo.focal.x * 100}% ${photo.focal.y * 100}%`;
  if (failed) {
    return (
      <div className={`thumb ${lead ? 'lead' : ''}`}>
        <button type="button" className="retry" id={`photo-${photo.id}`} onClick={() => { setFailed(false); setAttempt((value) => value + 1); }}>
          <ImageOff />
          <span>다시 불러오기</span>
        </button>
      </div>
    );
  }
  return (
    <button type="button" className={`thumb ${lead ? 'lead' : ''}`} id={`photo-${photo.id}`} onClick={onOpen}>
      <span className="frame" style={{ backgroundImage: `url(${photo.lqip})` }}>
        <img
          key={attempt}
          alt={label}
          src={resolveAssetUrl(photo.src.w800)}
          srcSet={`${resolveAssetUrl(photo.src.w800)} 800w, ${resolveAssetUrl(photo.src.w1200)} 1200w, ${resolveAssetUrl(photo.src.w1600)} 1600w`}
          sizes={sizes}
          style={{ objectPosition: position }}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      </span>
    </button>
  );
}

function Viewer({ photos, start, onClose }: { photos: Photo[]; start: number; onClose: () => void }) {
  const [index, setIndex] = useState(start);
  const [failed, setFailed] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const drag = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const origin = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    let popped = false;
    window.history.pushState({ invifeViewer: true }, '');
    document.documentElement.classList.add('is-overlay');
    const onPop = () => {
      popped = true;
      onCloseRef.current();
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      document.documentElement.classList.remove('is-overlay');
      if (!popped && window.history.state?.invifeViewer) window.history.back();
      origin?.focus();
    };
  }, []);

  useEffect(() => {
    const root = dialog.current;
    if (!root) return;
    const items = () => [...root.querySelectorAll<HTMLElement>('button:not(:disabled)')];
    items()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (window.history.state?.invifeViewer) window.history.back();
        else onCloseRef.current();
      }
      if (event.key === 'ArrowLeft') setIndex((value) => Math.max(0, value - 1));
      if (event.key === 'ArrowRight') setIndex((value) => Math.min(photos.length - 1, value + 1));
      if (event.key !== 'Tab') return;
      const list = items();
      const first = list[0];
      const last = list[list.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [photos.length]);

  useEffect(() => {
    setFailed(false);
  }, [index]);

  const photo = photos[index];
  if (!photo) return null;
  const close = () => {
    if (window.history.state?.invifeViewer) window.history.back();
    else onClose();
  };

  return (
    <div
      className="viewer"
      role="dialog"
      aria-modal="true"
      aria-label="사진 크게 보기"
      ref={dialog}
      onPointerDown={(event) => {
        drag.current = { x: event.clientX, y: event.clientY };
      }}
      onPointerUp={(event) => {
        const startPoint = drag.current;
        drag.current = null;
        if (!startPoint) return;
        const dx = event.clientX - startPoint.x;
        const dy = event.clientY - startPoint.y;
        if (dy > 72 && dy > Math.abs(dx)) {
          close();
          return;
        }
        if (Math.abs(dx) <= Math.abs(dy)) return;
        if (dx <= -48) setIndex((value) => Math.min(photos.length - 1, value + 1));
        if (dx >= 48) setIndex((value) => Math.max(0, value - 1));
      }}
    >
      <div className="viewer-bar">
        <p className="label-text nums">
          {index + 1} / {photos.length}
        </p>
        <button type="button" className="btn-icon" onClick={close} aria-label="닫기">
          <Close />
        </button>
      </div>
      <button type="button" className="btn-icon viewer-nav prev" aria-label="이전 사진" disabled={index === 0} onClick={() => setIndex((value) => value - 1)}>
        <ChevronLeft />
      </button>
      <div className="viewer-stage">
        {failed ? (
          <button type="button" className="retry" onClick={() => setFailed(false)}>
            <ImageOff />
            <span>다시 불러오기</span>
          </button>
        ) : (
          <img alt={`웨딩 사진 ${index + 1}/${photos.length}`} src={resolveAssetUrl(photo.src.w1600)} onError={() => setFailed(true)} />
        )}
      </div>
      <button type="button" className="btn-icon viewer-nav next" aria-label="다음 사진" disabled={index === photos.length - 1} onClick={() => setIndex((value) => value + 1)}>
        <ChevronRight />
      </button>
    </div>
  );
}

export default Gallery;
