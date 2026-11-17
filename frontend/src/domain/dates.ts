const WEEK_KO = ['일', '월', '화', '수', '목', '금', '토'] as const;
const WEEK_EN = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;

function parts(date: string): [number, number, number] {
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) throw new Error(`잘못된 날짜: ${date}`);
  return [year, month, day];
}

/** 달력 날짜의 요일. 시간대와 무관한 그레고리력. */
export function weekdayIndex(date: string): number {
  const [year, month, day] = parts(date);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** 예식 전날 23:59:59.999 KST. 그 시각까지 포함하고, 다음 밀리초부터 닫는다. */
export function defaultRsvpDeadline(ceremonyDate: string): Date {
  const [year, month, day] = parts(ceremonyDate);
  return new Date(Date.UTC(year, month - 1, day - 1, 23 - 9, 59, 59, 999));
}

/** 예식 다음 날 00:00 KST. */
export function defaultEndedAt(ceremonyDate: string): Date {
  const [year, month, day] = parts(ceremonyDate);
  return new Date(Date.UTC(year, month - 1, day + 1, -9, 0, 0, 0));
}

export function resolveEndedAt(ceremonyDate: string, override: string | null): Date {
  return override ? new Date(override) : defaultEndedAt(ceremonyDate);
}

export function isEventEnded(now: Date, ceremonyDate: string, override: string | null): boolean {
  return now.getTime() >= resolveEndedAt(ceremonyDate, override).getTime();
}

/** 마감 시각(23:59:59.999 KST)은 포함한다. 그 다음 밀리초부터 닫힌다. */
export function isDeadlineClosed(now: Date, deadline: string): boolean {
  return now.getTime() > new Date(deadline).getTime();
}

export function kstParts(iso: string): { month: number; day: number; weekday: number } {
  const shifted = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  return {
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
  };
}

export function deadlineCaption(deadline: string): string {
  const { month, day, weekday } = kstParts(deadline);
  return `${month}월 ${day}일(${WEEK_KO[weekday]})까지 수정할 수 있어요`;
}

export function formatKoreanTime(time: string): string {
  const [hourPart, minutePart] = time.split(':');
  const hour = Number(hourPart);
  const minute = Number(minutePart ?? 0);
  const period = hour < 12 ? '오전' : '오후';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  if (!minute) return `${period} ${hour12}시`;
  return `${period} ${hour12}시 ${minute}분`;
}

export function formatCoverWhen(date: string, time?: string): string {
  const [year, month, day] = parts(date);
  const head = `${year}. ${pad2(month)}. ${pad2(day)} ${WEEK_EN[weekdayIndex(date)]}`;
  if (!time) return head;
  return `${head} · ${formatKoreanTime(time)}`;
}

export function formatEnvelopeDate(date: string): string {
  const [year, month, day] = parts(date);
  return `${year}. ${pad2(month)}. ${pad2(day)}`;
}

export function formatMonthDay(date: string): string {
  const [, month, day] = parts(date);
  return `${pad2(month)}.${pad2(day)}`;
}

export function formatLongDate(date: string): string {
  const [year, month, day] = parts(date);
  return `${year}년 ${month}월 ${day}일 ${WEEK_KO[weekdayIndex(date)]}요일`;
}

export function formatMonthCaption(date: string): string {
  const [year, month] = parts(date);
  return `${year}년 ${month}월`;
}

export function ceremonyDateTime(date: string, time?: string): string {
  if (!time) return date;
  return `${date}T${time}:00+09:00`;
}

export function formatWhenLine(date: string, time: string | undefined, venue: string): string {
  const place = venue.trim();
  if (time && place) return `${formatKoreanTime(time)} · ${place}`;
  if (time) return formatKoreanTime(time);
  return place;
}

export function ogDescription(invitation: {
  ceremony: { date: string; time?: string; venueName: string };
}): string {
  const date = formatLongDate(invitation.ceremony.date).replace('요일', '요일');
  const time = invitation.ceremony.time ? ` ${formatKoreanTime(invitation.ceremony.time)}` : '';
  const venue = invitation.ceremony.venueName.trim();
  return venue ? `${date}${time} · ${venue}` : `${date}${time}`.trim();
}

export function monthGrid(date: string): { year: number; month: number; cells: Array<number | null> } {
  const [year, month] = parts(date);
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const count = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: Array<number | null> = Array.from({ length: first }, () => null);
  for (let day = 1; day <= count; day += 1) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null);
  return { year, month, cells };
}

export { WEEK_KO };
