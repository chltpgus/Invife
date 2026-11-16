export type AppLink = {
  app: string;
  web?: string;
  store?: string;
};

export function mapAppLinks(input: {
  lat: number;
  lng: number;
  name: string;
  address: string;
  appName: string;
  userAgent?: string;
}): { kakao: AppLink; naver: AppLink; tmap: AppLink } {
  const name = encodeURIComponent(input.name);
  const address = encodeURIComponent(input.address);
  const appName = encodeURIComponent(input.appName);
  return {
    kakao: {
      app: `kakaomap://look?p=${input.lat},${input.lng}`,
      web: `https://map.kakao.com/link/map/${name},${input.lat},${input.lng}`,
    },
    naver: {
      app: `nmap://place?lat=${input.lat}&lng=${input.lng}&name=${name}&appname=${appName}`,
      web: `https://map.naver.com/p/search/${address}`,
    },
    tmap: {
      app: `tmap://route?rGoName=${name}&rGoX=${input.lng}&rGoY=${input.lat}`,
      store: tmapStoreUrl(input.userAgent ?? ''),
    },
  };
}

export function addressSearchLinks(address: string): { kakao: string; naver: string } {
  const query = encodeURIComponent(address);
  return {
    kakao: `https://map.kakao.com/link/search/${query}`,
    naver: `https://map.naver.com/p/search/${query}`,
  };
}

export function tmapStoreUrl(userAgent: string): string {
  if (/iPad|iPhone|iPod/i.test(userAgent)) return 'https://apps.apple.com/kr/app/id431589174';
  return 'https://play.google.com/store/apps/details?id=com.skt.tmap.ku';
}

/** 앱 스킴이 1.5초 안에 화면을 가리지 않으면 웹 또는 스토어로 넘긴다. */
export function openMapApp(target: AppLink): void {
  const timer = window.setTimeout(() => {
    if (document.visibilityState === 'hidden') return;
    const fallback = target.web ?? target.store;
    if (fallback) window.location.href = fallback;
  }, 1500);
  const onVisibility = () => {
    if (document.visibilityState !== 'hidden') return;
    window.clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVisibility);
  };
  document.addEventListener('visibilitychange', onVisibility);
  window.location.href = target.app;
}
