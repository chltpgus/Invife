import { describe, expect, it } from 'vitest';
import { addressSearchLinks, mapAppLinks, tmapStoreUrl } from '@/maps/deeplinks';

describe('지도 딥링크', () => {
  const links = mapAppLinks({
    lat: 37.525,
    lng: 127.041,
    name: '더채플앳청담',
    address: '서울 강남구 도산대로 442',
    appName: 'https://invife.example/i/sample/',
    userAgent: 'Mozilla/5.0 (iPhone)',
  });

  it('카카오·네이버·티맵 주소를 스펙대로 만든다', () => {
    expect(links.kakao.app).toBe('kakaomap://look?p=37.525,127.041');
    expect(links.kakao.web).toBe(
      `https://map.kakao.com/link/map/${encodeURIComponent('더채플앳청담')},37.525,127.041`,
    );
    expect(links.naver.app).toContain('nmap://place?lat=37.525&lng=127.041&name=');
    expect(links.naver.app).toContain('appname=https%3A%2F%2Finvife.example%2Fi%2Fsample%2F');
    expect(links.naver.web).toBe('https://map.naver.com/p/search/%EC%84%9C%EC%9A%B8%20%EA%B0%95%EB%82%A8%EA%B5%AC%20%EB%8F%84%EC%82%B0%EB%8C%80%EB%A1%9C%20442');
    expect(links.tmap.app).toBe(
      `tmap://route?rGoName=${encodeURIComponent('더채플앳청담')}&rGoX=127.041&rGoY=37.525`,
    );
    expect(links.tmap.store).toBe('https://apps.apple.com/kr/app/id431589174');
    expect(tmapStoreUrl('Android')).toContain('play.google.com');
  });

  it('좌표가 없으면 검색 링크만 만든다', () => {
    expect(addressSearchLinks('서울 강남구').kakao).toBe('https://map.kakao.com/link/search/%EC%84%9C%EC%9A%B8%20%EA%B0%95%EB%82%A8%EA%B5%AC');
  });

});
