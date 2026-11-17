'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/icon';
import { env } from '@/env';

type KakaoMaps = {
  load: (callback: () => void) => void;
  Map: new (element: HTMLElement, options: { center: unknown; level: number }) => unknown;
  LatLng: new (lat: number, lng: number) => unknown;
  Marker: new (options: { position: unknown; map: unknown }) => unknown;
};

declare global {
  interface Window {
    kakao?: { maps: KakaoMaps };
  }
}

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
  const holder = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(!env.kakaoMapKey);

  useEffect(() => {
    if (!env.kakaoMapKey) return;
    let cancelled = false;
    const script = document.createElement('script');
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(env.kakaoMapKey)}&autoload=false`;
    script.async = true;
    script.onload = () => {
      const maps = window.kakao?.maps;
      if (!maps || cancelled) {
        setFailed(true);
        return;
      }
      maps.load(() => {
        if (cancelled || !holder.current) return;
        try {
          const center = new maps.LatLng(lat, lng);
          const map = new maps.Map(holder.current, { center, level: 3 });
          new maps.Marker({ position: center, map });
        } catch {
          setFailed(true);
        }
      });
    };
    script.onerror = () => setFailed(true);
    document.head.appendChild(script);
    return () => {
      cancelled = true;
      script.remove();
    };
  }, [lat, lng]);

  if (failed) {
    return (
      <div className="map-frame is-failed">
        <Icon name="map-pin" />
        <p className="body-strong">지도를 불러오지 못했어요</p>
        <p className="caption">주소와 지도 앱 버튼은 그대로 쓸 수 있어요</p>
      </div>
    );
  }

  return (
    <button type="button" className="map-frame is-live" onClick={onOpen}>
      <div ref={holder} className="map-canvas" role="img" aria-label={alt} />
    </button>
  );
}
