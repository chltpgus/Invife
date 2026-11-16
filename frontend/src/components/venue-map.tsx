'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/icon';
import { env } from '@/env';
import { kakaoStaticMapUrl } from '@/maps/deeplinks';

export function VenueMap({
  lat,
  lng,
  alt,
  onOpen,
}: {
  lat: number;
  lng: number;
  alt: string;
  onOpen: () => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(!env.kakaoRestApiKey);

  useEffect(() => {
    if (!env.kakaoRestApiKey) return;
    const controller = new AbortController();
    const url = kakaoStaticMapUrl({ lat, lng, width: 684, height: 456 });
    fetch(url, {
      signal: controller.signal,
      headers: { Authorization: `KakaoAK ${env.kakaoRestApiKey}` },
    })
      .then((response) => {
        if (!response.ok) throw new Error('map');
        return response.blob();
      })
      .then((blob) => setSrc(URL.createObjectURL(blob)))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setFailed(true);
      });
    return () => controller.abort();
  }, [lat, lng]);

  useEffect(() => {
    return () => {
      if (src) URL.revokeObjectURL(src);
    };
  }, [src]);

  if (failed || (!src && !env.kakaoRestApiKey)) {
    return (
      <div className="map-frame is-failed">
        <Icon name="map-pin" />
        <p className="body-strong">지도를 불러오지 못했어요</p>
        <p className="caption">주소와 지도 앱 버튼은 그대로 쓸 수 있어요</p>
      </div>
    );
  }

  return (
    <button type="button" className="map-frame" onClick={onOpen}>
      {src ? <img src={src} alt={alt} /> : <span className="sr-only">지도를 불러오는 중</span>}
    </button>
  );
}
