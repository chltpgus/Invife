import { defaultRsvpDeadline } from '@/domain/dates';
import type { FixtureRecord, Invitation } from '@/domain/types';
import { samplePhotos } from '@/data/generated-photos';

function deadline(date: string): string {
  return defaultRsvpDeadline(date).toISOString();
}

const fullCeremony = {
  date: '2027-05-15',
  time: '13:00',
  venueName: '더채플앳청담',
  hall: '3층 그레이스홀',
  address: '서울 강남구 도산대로 442',
  lat: 37.5248,
  lng: 127.0407,
};

const greeting = `서로가 서로의 일상이 된 지\n어느덧 여덟 번째 봄입니다.\n\n따뜻한 날, 저희 두 사람이\n한 가정을 이루려 합니다.\n가까이서 축복해 주시면\n더없는 기쁨이겠습니다.`;

function shell(input: Pick<Invitation, 'id' | 'slug' | 'theme'> & Partial<Invitation>): Invitation {
  return {
    groom: { name: '김민준', givenName: '민준', phone: '010-1111-2222' },
    bride: { name: '이서연', givenName: '서연', phone: '010-3333-4444' },
    ceremony: fullCeremony,
    greeting,
    families: {
      groom: {
        relation: '아들',
        father: { name: '김철수', phone: '010-2222-1001' },
        mother: { name: '박영희', phone: '010-2222-1002' },
      },
      bride: {
        relation: '딸',
        father: { name: '이정훈', phone: '010-2222-2001' },
        mother: { name: '최미경', phone: '010-2222-2002' },
      },
    },
    photos: samplePhotos,
    transport: {
      parking: '건물 지하 2층, 2시간 무료입니다. 만차 시 맞은편 공영주차장을 이용해 주세요.',
      subway: '수인분당선 압구정로데오역 5번 출구에서 도보 8분.',
      bus: '147, 240, 301 청담동 주민센터 하차.',
      other: '식장 입구 앞 하차는 어렵습니다.',
    },
    accountsNote: '참석이 어려우신 분들을 위해 계좌를 적습니다. 마음만으로도 감사합니다.',
    accounts: [
      { id: 'g1', side: 'groom', relation: '신랑', holder: '김민준', bank: '우리', number: '1002-000-000000' },
      { id: 'g2', side: 'groom', relation: '혼주', holder: '김철수', bank: '국민', number: '123456-01-123456' },
      { id: 'b1', side: 'bride', relation: '신부', holder: '이서연', bank: '신한', number: '110-000-000000' },
    ],
    rsvp: { deadline: deadline('2027-05-15') },
    ...input,
  };
}

export const fixtures: FixtureRecord[] = [
  {
    rsvpMode: 'ok',
    sharedRsvpToken: 'open-rsvp',
    invitation: shell({ id: 'inv-full', slug: 'minjun-seoyeon', theme: 'ivory' }),
    recipients: [
      { token: 'jihun', name: '김지훈', revoked: false, response: null },
      {
        token: 'mina',
        name: '박미나',
        revoked: false,
        response: {
          id: 'rsvp-mina',
          attending: true,
          companions: 1,
          name: '박미나',
          updatedAt: '2027-04-02T03:00:00.000Z',
        },
      },
      { token: 'old-link', name: '이준호', revoked: true, response: null },
    ],
  },
  {
    rsvpMode: 'ok',
    sharedRsvpToken: 'minimal-rsvp',
    invitation: shell({
      id: 'inv-minimal',
      slug: 'minimal-sage',
      theme: 'sage',
      groom: { name: '정하준', givenName: '하준' },
      bride: { name: '한지유', givenName: '지유' },
      ceremony: {
        date: '2027-09-04',
        venueName: '아펠가모 공덕',
        address: '서울 마포구 마포대로 92',
      },
      greeting: undefined,
      families: {},
      photos: [],
      transport: undefined,
      accountsNote: undefined,
      accounts: [],
      rsvp: { deadline: deadline('2027-09-04') },
    }),
    recipients: [],
  },
  {
    rsvpMode: 'ok',
    sharedRsvpToken: 'family-rsvp',
    invitation: shell({
      id: 'inv-deceased',
      slug: 'families-mist',
      theme: 'mist',
      groom: { name: '오세훈', givenName: '세훈', phone: '010-5555-0101' },
      bride: { name: '윤다은', givenName: '다은', phone: '010-5555-0202' },
      ceremony: {
        date: '2027-06-12',
        time: '11:30',
        venueName: '빌라드지디 수서',
        hall: '2층 가든홀',
        address: '서울 강남구 율현로 504',
        lat: 37.4884,
        lng: 127.1035,
      },
      greeting: '오랜 시간 곁을 지켜 주신 분들께\n저희의 시작을 전합니다.',
      families: {
        groom: {
          relation: '장남',
          father: { name: '오명환', phone: '010-5555-1100', deceased: true, deceasedStyle: 'hanja' },
          mother: { name: '배수진', phone: '010-5555-1101' },
        },
        bride: {
          relation: '차녀',
          father: { name: '윤태호', phone: '010-5555-2200' },
          mother: { name: '최은실', phone: '010-5555-2201', deceased: true, deceasedStyle: 'hangul' },
        },
      },
      photos: samplePhotos.slice(0, 4),
      accounts: [
        { id: 'd1', side: 'groom', relation: '신랑', holder: '오세훈', bank: '하나', number: '210-000000-00000' },
        { id: 'd2', side: 'groom', relation: '아버지', holder: '오명환', bank: '우리', number: '1002-111-222222' },
      ],
      rsvp: { deadline: deadline('2027-06-12') },
    }),
    recipients: [{ token: 'haeun', name: '김하은', revoked: false, response: null }],
  },
  {
    rsvpMode: 'ok',
    sharedRsvpToken: 'closed-rsvp',
    invitation: shell({
      id: 'inv-closed',
      slug: 'rsvp-closed',
      theme: 'ivory',
      ceremony: { ...fullCeremony, date: '2027-08-20', time: '12:00' },
      photos: samplePhotos.slice(0, 1),
      rsvp: { deadline: '2026-11-01T14:59:00.000Z' },
    }),
    recipients: [
      { token: 'soon', name: '최수아', revoked: false, response: null },
      {
        token: 'done',
        name: '장우진',
        revoked: false,
        response: {
          id: 'rsvp-done',
          attending: false,
          companions: 0,
          name: '장우진',
          updatedAt: '2026-10-01T01:00:00.000Z',
        },
      },
    ],
  },
  {
    rsvpMode: 'ok',
    sharedRsvpToken: 'ended-rsvp',
    invitation: shell({
      id: 'inv-ended',
      slug: 'ended-day',
      theme: 'sage',
      ceremony: { ...fullCeremony, date: '2026-10-03', time: '13:00' },
      photos: samplePhotos.slice(2, 3),
      rsvp: { deadline: deadline('2026-10-03') },
    }),
    recipients: [],
  },
  {
    rsvpMode: 'error',
    sharedRsvpToken: 'error-rsvp',
    invitation: shell({
      id: 'inv-error',
      slug: 'rsvp-error',
      theme: 'mist',
      photos: samplePhotos.slice(0, 1),
      rsvp: { deadline: deadline('2027-05-15') },
    }),
    recipients: [{ token: 'nora', name: '노라', revoked: false, response: null }],
  },
];
