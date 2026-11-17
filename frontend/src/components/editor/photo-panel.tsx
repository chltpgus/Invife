'use client';

import { useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Icon } from '@/components/icon';
import { PhotoFrame } from '@/components/photo';
import { clampFocal, lowQuality, moveItem, PHOTO_LIMIT, photoFileError, takeWithinLimit, type PhotoTone } from '@/domain/editor';
import { resolveAssetUrl } from '@/env';
import type { Photo } from '@/domain/types';

const tones: Array<{ id: PhotoTone; label: string }> = [
  { id: 'original', label: '원본' },
  { id: 'warm', label: '따뜻하게' },
  { id: 'mono', label: '흑백' },
];

export function PhotoPanel({
  photos,
  tone,
  onPhotos,
  onTone,
  onMessage,
  uploadFile,
  removePhoto,
}: {
  photos: Photo[];
  tone: PhotoTone;
  onPhotos: (photos: Photo[]) => void;
  onTone: (tone: PhotoTone) => void;
  onMessage: (text: string) => void;
  uploadFile: (file: File) => Promise<{ photo: Photo } | { error: string }>;
  removePhoto: (id: string) => Promise<boolean>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const [focalId, setFocalId] = useState<string | null>(null);
  const [pending, setPending] = useState<Array<{ id: string; name: string; status: 'wait' | 'work' | 'error'; message?: string }>>([]);
  const cancelled = useRef(new Set<string>());
  const focal = photos.find((photo) => photo.id === focalId) ?? null;

  async function add(files: File[]) {
    const rejected = files.filter((file) => photoFileError(file));
    const usable = files.filter((file) => !photoFileError(file));
    const { accepted, dropped } = takeWithinLimit(photos.length + pending.length, usable);
    if (dropped > 0) onMessage(`사진은 10장까지 올릴 수 있어요. ${dropped}장은 빠졌어요`);
    else if (rejected[0]) onMessage(photoFileError(rejected[0]) ?? '사진을 올리지 못했어요');
    if (accepted.length === 0) return;
    const jobs = accepted.map((file) => ({ id: crypto.randomUUID(), name: file.name, file, status: 'wait' as const }));
    setPending((current) => [...current, ...jobs.map(({ id, name, status }) => ({ id, name, status }))]);
    let cursor = 0;
    const made: Array<Photo | undefined> = [];
    async function worker() {
      while (cursor < jobs.length) {
        const index = cursor;
        const job = jobs[index];
        cursor += 1;
        if (!job || cancelled.current.has(job.id)) continue;
        setPending((current) => current.map((item) => (item.id === job.id ? { ...item, status: 'work' } : item)));
        const result = await uploadFile(job.file);
        if (cancelled.current.has(job.id)) continue;
        if ('error' in result) {
          setPending((current) => current.map((item) => (item.id === job.id ? { ...item, status: 'error', message: result.error } : item)));
          onMessage(result.error);
          continue;
        }
        made[index] = result.photo;
        setPending((current) => current.filter((item) => item.id !== job.id));
      }
    }
    await Promise.all(Array.from({ length: Math.min(3, jobs.length) }, () => worker()));
    const ordered = made.filter((photo): photo is Photo => Boolean(photo));
    if (ordered.length > 0) onPhotos([...photos, ...ordered].slice(0, PHOTO_LIMIT));
  }

  async function remove(id: string) {
    setMenu(null);
    const ok = await removePhoto(id);
    if (!ok) {
      onMessage('사진을 지우지 못했어요');
      return;
    }
    onPhotos(photos.filter((photo) => photo.id !== id));
  }

  function updateFocal(next: { x: number; y: number }) {
    if (!focal) return;
    onPhotos(photos.map((photo) => (photo.id === focal.id ? { ...photo, focal: next } : photo)));
    setFocalId(null);
  }

  return (
    <div data-tone={tone}>
      <p className="ed-caption">
        사진 {photos.length} / {PHOTO_LIMIT}. 첫 번째 사진이 커버와 갤러리 대표가 돼요.
      </p>
      <div
        className="ed-drop"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          void add([...event.dataTransfer.files]);
        }}
      >
        여기에 사진을 끌어다 놓으세요
      </div>
      <div className="ed-photos">
        {photos.map((photo, index) => (
          <div
            key={photo.id}
            className="ed-tile"
            draggable
            onDragStart={() => setDrag(index)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => {
              if (drag === null) return;
              onPhotos(moveItem(photos, drag, index));
              setDrag(null);
            }}
          >
            <img src={resolveAssetUrl(photo.src.w800)} alt={`사진 ${index + 1}`} style={{ objectPosition: `${photo.focal.x * 100}% ${photo.focal.y * 100}%` }} />
            {index === 0 ? <span className="ed-cover-badge">커버</span> : null}
            {lowQuality(photo) ? (
              <button type="button" className="ed-quality" aria-label="화질 안내" onClick={() => onMessage('화질이 낮아 흐리게 보일 수 있어요')}>
                <Icon name="info" size={14} />
              </button>
            ) : null}
            <div className="ed-tile-menu">
              <button type="button" className="ed-icon-btn" aria-label={`사진 ${index + 1} 메뉴`} onClick={() => setMenu(menu === photo.id ? null : photo.id)}>
                <Icon name="more-vertical" size={18} />
              </button>
              {menu === photo.id ? (
                <div className="ed-menu" role="menu">
                  <button type="button" onClick={() => { setFocalId(photo.id); setMenu(null); }}>초점 지정</button>
                  <button type="button" onClick={() => { onPhotos(moveItem(photos, index, 0)); setMenu(null); }}>맨 앞으로</button>
                  <button type="button" onClick={() => { onPhotos(moveItem(photos, index, index - 1)); setMenu(null); }}>앞으로</button>
                  <button type="button" onClick={() => { onPhotos(moveItem(photos, index, index + 1)); setMenu(null); }}>뒤로</button>
                  <button type="button" onClick={() => { void remove(photo.id); }}>삭제</button>
                </div>
              ) : null}
            </div>
          </div>
        ))}
        {pending.map((item) => (
          <div key={item.id} className="ed-tile" aria-busy={item.status !== 'error'}>
            <span className="ed-caption">{item.status === 'error' ? '올리지 못했어요' : item.status === 'work' ? '변환 중…' : '대기 중'}</span>
            <button type="button" className="ed-icon-btn" aria-label="취소" onClick={() => { cancelled.current.add(item.id); setPending((current) => current.filter((job) => job.id !== item.id)); }}>
              <Icon name="close" size={16} />
            </button>
            {item.status === 'error' ? (
              <button type="button" onClick={() => setPending((current) => current.filter((job) => job.id !== item.id))}>
                삭제
              </button>
            ) : null}
          </div>
        ))}
        {photos.length < PHOTO_LIMIT ? (
          <button type="button" className="ed-tile is-add" onClick={() => input.current?.click()}>
            <Icon name="image-plus" />
            사진 추가
          </button>
        ) : null}
      </div>
      <input
        id="cover-photo"
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/heic,image/heif,image/webp"
        multiple
        hidden
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = '';
          void add(files);
        }}
      />
      <div className="ed-segment" role="radiogroup" aria-label="색감 필터">
        {tones.map((item) => (
          <button key={item.id} type="button" role="radio" aria-checked={tone === item.id} className={tone === item.id ? 'is-on' : ''} onClick={() => onTone(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
      <p className="ed-hint">필터는 사진 10장에 함께 적용돼요.</p>
      {focal ? <FocalEditor photo={focal} lead={photos[0]?.id === focal.id} onDone={updateFocal} onClose={() => setFocalId(null)} /> : null}
    </div>
  );
}

function FocalEditor({
  photo,
  lead,
  onDone,
  onClose,
}: {
  photo: Photo;
  lead: boolean;
  onDone: (focal: { x: number; y: number }) => void;
  onClose: () => void;
}) {
  const [focal, setFocal] = useState(photo.focal);
  const stage = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ left: 0, top: 0, width: 0, height: 0 });

  function metrics() {
    const node = stage.current;
    const image = node?.querySelector('img');
    if (!node || !image) return null;
    const rect = node.getBoundingClientRect();
    const naturalW = image.naturalWidth || photo.width;
    const naturalH = image.naturalHeight || photo.height;
    const scale = Math.min(rect.width / naturalW, rect.height / naturalH);
    const width = naturalW * scale;
    const height = naturalH * scale;
    return {
      left: (rect.width - width) / 2,
      top: (rect.height - height) / 2,
      width,
      height,
      absLeft: rect.left + (rect.width - width) / 2,
      absTop: rect.top + (rect.height - height) / 2,
    };
  }

  function place(clientX: number, clientY: number) {
    const current = metrics();
    if (!current || current.width === 0) return;
    setBox(current);
    setFocal({ x: clampFocal((clientX - current.absLeft) / current.width), y: clampFocal((clientY - current.absTop) / current.height) });
  }

  function nudge(event: ReactKeyboardEvent) {
    const step = event.shiftKey ? 0.1 : 0.01;
    const next = { ...focal };
    if (event.key === 'ArrowLeft') next.x = clampFocal(focal.x - step);
    else if (event.key === 'ArrowRight') next.x = clampFocal(focal.x + step);
    else if (event.key === 'ArrowUp') next.y = clampFocal(focal.y - step);
    else if (event.key === 'ArrowDown') next.y = clampFocal(focal.y + step);
    else return;
    event.preventDefault();
    setFocal(next);
  }

  const preview = { ...photo, focal };
  return (
    <div className="ed-focal" data-tone={undefined}>
      <div className="ed-inline">
        <h2 className="ed-title">얼굴 위치</h2>
        <button type="button" className="ed-btn-text" onClick={() => setFocal({ x: 0.5, y: 0.4 })}>
          가운데로 되돌리기
        </button>
        <button type="button" className="ed-btn" onClick={() => onDone(focal)}>
          완료
        </button>
        <button type="button" className="ed-icon-btn" aria-label="닫기" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      <div
        ref={stage}
        className="ed-focal-stage"
        role="application"
        tabIndex={0}
        aria-describedby="focal-live"
        onPointerDown={(event) => {
          place(event.clientX, event.clientY);
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) place(event.clientX, event.clientY);
        }}
        onKeyDown={nudge}
      >
        <img src={resolveAssetUrl(photo.src.w1600)} alt="" draggable={false} onLoad={() => { const current = metrics(); if (current) setBox(current); }} />
        <span className="ed-focal-mark" style={{ left: box.width ? box.left + focal.x * box.width : `${focal.x * 100}%`, top: box.width ? box.top + focal.y * box.height : `${focal.y * 100}%` }} />
      </div>
      <p id="focal-live" className="ed-caption" aria-live="polite">
        사진을 탭하거나 방향키로 얼굴 위치를 지정하세요. 현재 가로 {Math.round(focal.x * 100)}%, 세로 {Math.round(focal.y * 100)}%
      </p>
      <div className="ed-crops">
        {lead ? <Crop photo={preview} label="커버 4:5" width={96} height={120} fit="cover" /> : null}
        <Crop photo={preview} label="썸네일 1:1" width={96} height={96} fit="cover" />
        {lead ? <Crop photo={preview} label="카톡 공유 2:1" width={160} height={80} fit="cover" /> : <Crop photo={preview} label="뷰어" width={96} height={128} fit="contain" />}
      </div>
    </div>
  );
}

function Crop({ photo, label, width, height, fit }: { photo: Photo; label: string; width: number; height: number; fit: 'cover' | 'contain' }) {
  return (
    <div>
      <div className="ed-crop" style={{ width, height }}>
        <PhotoFrame photo={photo} alt={label} sizes={`${width}px`} fit={fit} />
      </div>
      <p>{label}</p>
    </div>
  );
}
