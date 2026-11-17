import { defaultRsvpDeadline } from '@/domain/dates';
import { DEFAULT_FOCAL } from '@/domain/editor';
import type { Invitation, ThemeId } from '@/domain/types';

export const themeChoices: Array<{ id: ThemeId; label: string; chips: [string, string, string] }> = [
  { id: 'ivory', label: 'Ivory · Burgundy', chips: ['#F4EFE6', '#1F1B16', '#7A2E2E'] },
  { id: 'sage', label: 'Sage · Forest', chips: ['#ECEEE7', '#1A1F1B', '#3D5A45'] },
  { id: 'mist', label: 'Mist · Navy', chips: ['#ECEDEF', '#1A1D24', '#2C466A'] },
];

export function isTheme(value: string | undefined): value is ThemeId {
  return value === 'ivory' || value === 'sage' || value === 'mist';
}

export function themeSample(theme: ThemeId): Invitation {
  return {
    id: `sample-${theme}`,
    slug: `sample-${theme}`,
    theme,
    groom: { name: '김민준', givenName: '민준' },
    bride: { name: '이서연', givenName: '서연' },
    ceremony: { date: '2027-05-15', time: '13:00', venueName: '더채플앳청담', hall: '그레이스홀' },
    families: {},
    photos: [
      {
        id: 'sample-photo',
        width: 800,
        height: 1000,
        focal: DEFAULT_FOCAL,
        src: {
          w800: 'samples/photo-01-800.webp',
          w1200: 'samples/photo-01-1200.webp',
          w1600: 'samples/photo-01-1600.webp',
        },
        lqip: '',
      },
    ],
    accounts: [],
    rsvp: { deadline: defaultRsvpDeadline('2027-05-15').toISOString() },
  };
}

export const greetingExamples = [
  '서로가 서로의 일상이 된 지\n어느덧 여덟 번째 봄입니다.\n\n따뜻한 날, 저희 두 사람이\n한 가정을 이루려 합니다.\n가까이서 축복해 주시면\n더없는 기쁨이겠습니다.',
  '오랜 시간 함께한 두 사람이\n이제 하나의 가정을 이루려 합니다.\n\n귀한 걸음으로 축복해 주시면\n큰 기쁨으로 간직하겠습니다.',
  '저희 두 사람이 사랑으로\n한 가정을 이루게 되었습니다.\n\n바쁘시더라도 오셔서\n축복해 주시면 감사하겠습니다.',
];

export const banks = [
  '국민',
  '신한',
  '우리',
  '하나',
  '농협',
  '기업',
  '카카오뱅크',
  '토스뱅크',
  '케이뱅크',
  'SC제일',
  '우체국',
  '새마을',
  '수협',
  '대구',
  '부산',
  '경남',
  '광주',
  '전북',
  '제주',
  '삼성증권',
  '미래에셋증권',
  '한국투자증권',
  'NH투자증권',
  '키움증권',
];
