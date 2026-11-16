import type { RsvpResponse } from '@/domain/types';

/**
 * 샘플 서버가 아는 토큰. 페이지와 빌드 데이터는 이 파일을 가져오지 않는다.
 * 로컬에서 `/i/{slug}/g/{token}/`, `/i/{slug}/s/{token}/` 를 열어 볼 때 쓴다.
 */
export type SampleRecipient = {
  token: string;
  name: string;
  revoked: boolean;
  response: RsvpResponse | null;
};

export type SampleSlug = {
  slug: string;
  /** `/s/` 경로의 출처 표식. 비밀이 아니다. */
  rsvpToken: string;
  unavailable?: boolean;
  recipients: SampleRecipient[];
};

export const sampleDirectory: SampleSlug[] = [
  {
    slug: 'minjun-seoyeon',
    rsvpToken: 'open-rsvp',
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
  { slug: 'minimal-sage', rsvpToken: 'minimal-rsvp', recipients: [] },
  {
    slug: 'families-mist',
    rsvpToken: 'family-rsvp',
    recipients: [{ token: 'haeun', name: '김하은', revoked: false, response: null }],
  },
  {
    slug: 'rsvp-closed',
    rsvpToken: 'closed-rsvp',
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
  { slug: 'ended-day', rsvpToken: 'ended-rsvp', recipients: [] },
  {
    slug: 'rsvp-error',
    rsvpToken: 'error-rsvp',
    unavailable: true,
    recipients: [{ token: 'nora', name: '노라', revoked: false, response: null }],
  },
];
