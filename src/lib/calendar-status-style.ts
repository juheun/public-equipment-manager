// 발전기 대여 캘린더(장비 상세 이력, 대시보드 대여 카드) 전반에서 공유하는 상태별
// 시각 토큰. 간소화된 대여 모델(ACTIVE/COMPLETED)에 맞춰 3가지 상태만 색상으로
// 분리하되, 사선 스트라이프나 점선 테두리처럼 눈에 피로한 장식은 쓰지 않는다 — 뱃지는
// 부드러운 파스텔(옅은 배경 + 얇은 테두리 + 진한 텍스트), 캘린더 막대는 또렷한 단색
// 솔리드로 통일한다. 이 토큰은 "캘린더/대여 상태 표시" 용도로만 쓴다 — 장비 목록의
// 일반 상태 뱃지(EQUIPMENT_STATUS_META 등)는 별도이므로 건드리지 않는다.

export type CalendarVisualStatus = "ACTIVE" | "MAINTENANCE" | "RETURNED";

interface CalendarStatusStyle {
  label: string;
  /** MiniMonthCalendarBar 등 캘린더 막대용 — 또렷한 단색 솔리드. */
  barClassName: string;
  /** Badge 컴포넌트용 — 옅은 파스텔 배경 + 얇은 테두리. */
  badgeClassName: string;
  /** 범례의 작은 색상 견본용 — 막대와 동일한 단색을 쓴다. */
  dotClassName: string;
}

export const CALENDAR_STATUS_STYLE: Record<CalendarVisualStatus, CalendarStatusStyle> = {
  ACTIVE: {
    label: "대여 가동중",
    barClassName: "bg-blue-600 text-white",
    badgeClassName:
      "bg-blue-500/15 text-blue-700 border border-blue-500/30 hover:bg-blue-500/15 dark:text-blue-300",
    dotClassName: "bg-blue-600",
  },
  MAINTENANCE: {
    label: "정비/수리",
    barClassName: "bg-rose-500 text-white",
    badgeClassName:
      "bg-rose-500/15 text-rose-700 border border-rose-500/30 hover:bg-rose-500/15 dark:text-rose-300",
    dotClassName: "bg-rose-500",
  },
  RETURNED: {
    label: "반납 완료",
    barClassName: "bg-zinc-400 text-white",
    badgeClassName:
      "bg-zinc-500/15 text-zinc-700 border border-zinc-500/30 hover:bg-zinc-500/15 dark:text-zinc-300",
    dotClassName: "bg-zinc-400",
  },
};
