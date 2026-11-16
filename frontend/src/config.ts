/**
 * 오너 결정이 아직 값으로만 바뀌면 되는 설정.
 * 초대장 JSON 에 넣지 않습니다.
 */

/** 받는 사람별 링크의 이름 영역. 공용 RSVP 링크는 항상 필수 입력입니다. */
export type RsvpNameMode = 'hidden' | 'show-name' | 'prefill-input';

/**
 * 공용 초대장 링크의 참석 영역.
 * - notice: 폼 없이 안내만. 응답 토큰은 페이지에 넣지 않음.
 * - inline-form: 공용 RSVP 와 같은 이름 입력 폼.
 */
export type SharedInvitationRsvp = 'notice' | 'inline-form';

export const siteConfig = {
  /**
   * 받는 사람 링크 RSVP 는 「OO 님으로 응답해요」와 「OO 님이 아니신가요?」.
   * hidden · show-name 은 그 칸만 바꾸는 스위치다.
   */
  rsvpNameMode: 'prefill-input' as RsvpNameMode,

  /**
   * null 이면 예식 다음 날 00:00 KST.
   * ISO 문자열이면 모든 초대장에 그 시각을 쓴다.
   */
  endedEventAt: null as string | null,

  /** 공용 초대장과 공용 RSVP 를 분리한 뒤의 기본 해석. 계약 문서의 열린 질문. */
  sharedInvitationRsvp: 'notice' as SharedInvitationRsvp,
};
