export function normalizeName(value: string): string {
  return value.trim().normalize('NFC');
}

export function codePoints(value: string): number {
  return [...value].length;
}

export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function isTime(value: string): boolean {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return false;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

export function phoneOk(value: string): boolean {
  if (!value) return true;
  if (!/^[0-9-]+$/.test(value)) return false;
  const digits = value.replace(/-/g, '').length;
  return digits >= 8 && digits <= 15;
}

export function accountNumberOk(value: string): boolean {
  if (!/^[0-9-]+$/.test(value)) return false;
  const digits = value.replace(/-/g, '').length;
  return digits >= 8 && digits <= 20;
}

export function iso(value: Date | string): string {
  return new Date(value).toISOString();
}

export function sameInstant(left: string, right: string): boolean {
  const a = new Date(left).getTime();
  const b = new Date(right).getTime();
  return Number.isFinite(a) && a === b;
}
