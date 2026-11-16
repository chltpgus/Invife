/**
 * 초대장 JSON 에 넣지 않는 배포 설정.
 * 끝난 행사 시각만 남긴다. 이름 칸과 공용 초대장 RSVP 는 고정이다.
 */
export const siteConfig = {
  /**
   * null 이면 예식 다음 날 00:00 KST.
   * ISO 문자열이면 모든 초대장에 그 시각을 쓴다.
   * 비교는 브라우저에서 한다.
   */
  endedEventAt: null as string | null,
};
