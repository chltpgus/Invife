'use client';

import { eyebrows } from '@/content/copy';
import { Icon } from '@/components/icon';
import { copyText, useToast } from '@/components/toast';
import { VenueMap } from '@/components/venue-map';
import { absoluteUrl } from '@/env';
import type { Invitation } from '@/domain/types';
import { hasTransport, sectionFlags } from '@/domain/visibility';
import { addressSearchLinks, mapAppLinks, openMapApp, type AppLink } from '@/maps/deeplinks';

const transportOrder = [
  ['parking', '주차'],
  ['subway', '지하철'],
  ['bus', '버스'],
  ['other', '기타'],
] as const;

export function Directions({ invitation }: { invitation: Invitation }) {
  const notify = useToast();
  const flags = sectionFlags(invitation);
  if (!flags.directions) return null;
  const { ceremony } = invitation;
  const address = ceremony.address?.trim() ?? '';
  const coords = ceremony.lat !== undefined && ceremony.lng !== undefined;
  const appName = absoluteUrl(`/i/${invitation.slug}/`);
  const apps = coords
    ? mapAppLinks({
        lat: ceremony.lat ?? 0,
        lng: ceremony.lng ?? 0,
        name: ceremony.venueName,
        address,
        appName,
        userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
      })
    : null;
  const search = address ? addressSearchLinks(address) : null;

  return (
    <section className="section" id="directions" aria-labelledby="directions-title">
      <p className="eyebrow" aria-hidden="true">
        {eyebrows.directions}
      </p>
      <h2 id="directions-title" className="heading">
        오시는 길
      </h2>
      <p className="body-strong">{ceremony.venueName}</p>
      {address ? <p className="text-2">{address}</p> : null}
      {coords && ceremony.lat !== undefined && ceremony.lng !== undefined ? (
        <VenueMap
          lat={ceremony.lat}
          lng={ceremony.lng}
          alt={`${ceremony.venueName} 위치 지도`}
          onOpen={() => apps && openMapApp(apps.kakao)}
        />
      ) : null}
      <div className="button-row">
        {address ? (
          <button type="button" className="btn btn-secondary" onClick={() => void copyText(address, '주소를 복사했어요', notify)}>
            <Icon name="copy" size={18} />
            주소 복사
          </button>
        ) : null}
        {apps ? (
          <>
            <MapButton label="카카오맵" target={apps.kakao} />
            <MapButton label="네이버 지도" target={apps.naver} />
            <MapButton label="티맵" target={apps.tmap} />
          </>
        ) : null}
        {!apps && search ? (
          <>
            <a className="btn btn-secondary" href={search.kakao}>
              카카오맵에서 검색
            </a>
            <a className="btn btn-secondary" href={search.naver}>
              네이버 지도에서 검색
            </a>
          </>
        ) : null}
      </div>
      {flags.transport && invitation.transport && hasTransport(invitation.transport) ? (
        <div className="transport">
          {transportOrder.map(([key, label]) => {
            const text = invitation.transport?.[key]?.trim();
            if (!text) return null;
            return (
              <div key={key}>
                <p className="label-text">{label}</p>
                <p>{text}</p>
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function MapButton({ label, target }: { label: string; target: AppLink }) {
  return (
    <button type="button" className="btn btn-secondary" onClick={() => openMapApp(target)}>
      <Icon name="external" size={18} />
      {label}
    </button>
  );
}
