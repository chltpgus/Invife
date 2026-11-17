import type { ReactNode } from 'react';

const paths: Record<string, ReactNode> = {
  alert: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5M12 16.2v.3" />
    </>
  ),
  'arrow-up': <path d="M12 19V5M6 11l6-6 6 6" />,
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="1" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  'chevron-down': <path d="M6 9l6 6 6-6" />,
  'chevron-left': <path d="M15 5l-7 7 7 7" />,
  'chevron-right': <path d="M9 5l7 7-7 7" />,
  'chevron-up': <path d="M6 15l6-6 6 6" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  'cloud-check': (
    <>
      <path d="M7 18h9a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.5 1.5A3.5 3.5 0 0 0 7 18z" />
      <path d="M8.5 14.5l2 2 4-4" />
    </>
  ),
  'cloud-off': (
    <>
      <path d="M7 18h9a4 4 0 0 0 .4-8 5.4 5.4 0 0 0-2.2-1.2M4.5 16.2A3.5 3.5 0 0 1 6.2 10" />
      <path d="M4 4l16 16" />
    </>
  ),
  'check-circle': (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.2l2.6 2.6L16.2 9" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  crosshair: (
    <>
      <circle cx="12" cy="12" r="6" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.2" />
    </>
  ),
  filter: <path d="M4 5h16l-6 7.2V19l-4 1.5v-8.3L4 5z" />,
  grip: (
    <>
      <path d="M9 7h.01M9 12h.01M9 17h.01M15 7h.01M15 12h.01M15 17h.01" />
    </>
  ),
  'image-plus': (
    <>
      <rect x="3.5" y="4.5" width="13" height="13" rx="1" />
      <path d="M3.5 14.5l3.5-3.5 2.5 2.5M18.5 15.5v6M15.5 18.5h6" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 8v.4" />
    </>
  ),
  'more-vertical': <path d="M12 6.5v.01M12 12v.01M12 17.5v.01" />,
  palette: (
    <>
      <path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.8-1 1.4-2.1-.3-.8.2-1.4 1-1.4H16a3 3 0 0 0 3-3.2A8.5 8.5 0 0 0 12 3.5z" />
      <path d="M8 10.2h.01M10.2 7.6h.01M14 7.6h.01M16 10.5h.01" />
    </>
  ),
  'phone-frame': (
    <>
      <rect x="7" y="2.5" width="10" height="19" rx="2" />
      <path d="M11 18.5h2" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="M15.5 15.5L20 20" />
    </>
  ),
  trash: (
    <>
      <path d="M5 7h14M9 7V5h6v2M8 7l.7 12h6.6L16 7" />
    </>
  ),
  'arrow-left': <path d="M19 12H5M11 6l-6 6 6 6" />,
  'chevrons-up-down': <path d="M8 9l4-4 4 4M8 15l4 4 4-4" />,
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="1" />
      <path d="M5 15H4.5A.5.5 0 0 1 4 14.5v-10a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 .5.5V5" />
    </>
  ),
  external: <path d="M14 4h6v6M20 4l-8.5 8.5M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />,
  'image-off': (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="1" />
      <path d="M3.5 16l5-5 4 4 2.5-2.5 5.5 5.5M4 4l16 16" />
    </>
  ),
  'map-pin': (
    <>
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.2" />
    </>
  ),
  message: <path d="M20 15.5a1.5 1.5 0 0 1-1.5 1.5H8l-4 3.5V5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5z" />,
  minus: <path d="M5 12h14" />,
  phone: (
    <path d="M21 16.4v2.9a1.9 1.9 0 0 1-2.1 1.9 18.8 18.8 0 0 1-8.2-2.9 18.5 18.5 0 0 1-5.7-5.7A18.8 18.8 0 0 1 2.1 4.3 1.9 1.9 0 0 1 4 2.2h2.9a1.9 1.9 0 0 1 1.9 1.6c.1.9.4 1.8.7 2.6a1.9 1.9 0 0 1-.4 2L7.8 9.7a15.2 15.2 0 0 0 5.7 5.7l1.3-1.3a1.9 1.9 0 0 1 2-.4c.8.3 1.7.6 2.6.7a1.9 1.9 0 0 1 1.6 2z" />
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  refresh: <path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6" />,
  spinner: <path d="M12 3a9 9 0 1 0 9 9" />,
};

export type IconName = keyof typeof paths;

export function Icon({ name, size = 24 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
