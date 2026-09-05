// SPEC.md 1장: 타임존은 한국 표준시(KST / Asia/Seoul)로 일괄 적용.
// 서버(Vercel)는 UTC로 동작하므로, "오늘" 판정과 월간 캘린더 계산은
// 항상 KST 기준 날짜로 변환해서 처리한다.

const KST_TIME_ZONE = "Asia/Seoul";

/** 주어진 시각을 KST 기준 'YYYY-MM-DD' 문자열로 변환 (DATE 컬럼과 직접 비교 가능) */
export function toKstDateString(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: KST_TIME_ZONE }).format(date);
}

/**
 * KST 기준 오늘 날짜를 담은 로컬 Date 객체를 반환한다.
 * 실제 UTC 시각과는 무관하게, 달력 계산(연/월/일)에만 사용할 것.
 */
export function getKstTodayAsLocalDate(): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: KST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);

  return new Date(year, month - 1, day);
}

/** 'YYYY-MM-DD' 문자열을 달력 계산용 로컬 Date로 변환 (타임존 이동 없이) */
export function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** <input type="datetime-local"> 기본값으로 쓸 KST 기준 "지금" 문자열 (YYYY-MM-DDTHH:mm). */
export function toKstDateTimeLocalString(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: KST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** dateStr(YYYY-MM-DD) 기준 오늘(todayStr) 대비 남은/지난 일수. 0=오늘, 음수=지연, 양수=미래. */
export function diffCalendarDays(dateStr: string, todayStr: string): number {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  return Math.round((parseDateOnly(dateStr).getTime() - parseDateOnly(todayStr).getTime()) / MS_PER_DAY);
}

/** 'YYYY-MM' 쿼리 파라미터를 그 달 1일의 로컬 Date로 변환. 형식이 잘못되면 null. */
export function parseMonthParam(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return new Date(year, month - 1, 1);
}
