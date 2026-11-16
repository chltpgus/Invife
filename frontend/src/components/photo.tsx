'use client';

import { useState } from 'react';
import { Icon } from '@/components/icon';
import type { Photo } from '@/domain/types';
import { resolveAssetUrl } from '@/env';

export function PhotoFrame({
  photo,
  alt,
  sizes,
  priority = false,
  fit = 'cover',
  className,
}: {
  photo: Photo;
  alt: string;
  sizes: string;
  priority?: boolean;
  fit?: 'cover' | 'contain';
  className?: string;
}) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const position = `${photo.focal.x * 100}% ${photo.focal.y * 100}%`;

  return (
    <div
      className={`frame ${loaded ? 'is-loaded' : ''} ${failed ? 'is-failed' : ''} ${className ?? ''}`}
      style={{ backgroundImage: failed ? undefined : `url(${photo.lqip})` }}
    >
      {failed ? (
        <button type="button" className="retry" onClick={() => { setFailed(false); setLoaded(false); setAttempt((value) => value + 1); }}>
          <Icon name="image-off" />
          <span>다시 불러오기</span>
        </button>
      ) : (
        <img
          key={attempt}
          alt={alt}
          src={resolveAssetUrl(photo.src.w800)}
          srcSet={`${resolveAssetUrl(photo.src.w800)} 800w, ${resolveAssetUrl(photo.src.w1200)} 1200w, ${resolveAssetUrl(photo.src.w1600)} 1600w`}
          sizes={sizes}
          width={photo.width}
          height={photo.height}
          style={{ objectFit: fit, objectPosition: position }}
          fetchPriority={priority ? 'high' : 'auto'}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}
