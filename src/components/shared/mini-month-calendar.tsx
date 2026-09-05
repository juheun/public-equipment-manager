"use client";

import { eachDayOfInterval, endOfMonth, format, getDay, startOfMonth } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toKstDateString } from "@/lib/date";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export interface MiniMonthCalendarDayInfo {
  date: Date;
  dateStr: string;
  isToday: boolean;
}

/** 특정 날짜 셀에 걸쳐 그려지는 연속 막대(구글 캘린더 스타일) 한 조각. */
export interface MiniMonthCalendarBar {
  /** 막대 배경색 등 (예: "bg-blue-500"). */
  className: string;
  /** 이 날짜가 이벤트의 실제 시작일이면 true — 왼쪽 끝을 둥글게 마무리한다. */
  roundLeft: boolean;
  /** 이 날짜가 이벤트의 실제 종료일이면 true — 오른쪽 끝을 둥글게 마무리한다. */
  roundRight: boolean;
  title?: string;
}

interface MiniMonthCalendarProps {
  month: Date;
  onMonthChange: (next: Date) => void;
  renderDay: (info: MiniMonthCalendarDayInfo) => React.ReactNode;
  /**
   * 그 날짜에 표시할 막대들을 레인(줄) 인덱스 순서로 반환한다 — 서로 겹치는 구간이 있으면
   * 여러 줄로 쌓인다. 특정 레인이 그 날 비어 있으면 정렬 유지를 위해 그 자리에 null을 넣는다
   * (호출 측이 assignLanes 등으로 날짜 전체에 걸쳐 레인을 일관되게 배정해야 같은 이벤트가
   * 매일 같은 줄에 그려져 "이어지는" 느낌이 유지된다).
   */
  /**
   * 레인 안에서 같은 날 두 구간이 경계만 맞닿는 경우(당일 반납 후 당일 재출고 등) 그 자리에
   * 조각을 2개 넣으면 셀을 좌우로 나눠 그린다(왼쪽=끝나는 쪽, 오른쪽=시작하는 쪽).
   */
  renderBars?: (info: MiniMonthCalendarDayInfo) => Array<MiniMonthCalendarBar[] | null>;
  onDayClick?: (info: MiniMonthCalendarDayInfo) => void;
  /** 날짜 셀 최소 높이 (Tailwind 클래스). 배지가 여러 개 들어가야 하면 늘린다. */
  cellHeightClassName?: string;
}

/** 다이얼로그/드로어 내부용 소형 월간 캘린더. 셀 내용은 renderDay로 위임한다. */
export function MiniMonthCalendar({
  month,
  onMonthChange,
  renderDay,
  renderBars,
  onDayClick,
  cellHeightClassName = "min-h-12",
}: MiniMonthCalendarProps) {
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const todayStr = toKstDateString();
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const leadingBlanks = getDay(monthStart);

  const monthLabel = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
  }).format(monthStart);

  return (
    <div>
      <div className="mb-2 flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => onMonthChange(new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1))}
          aria-label="이전 달"
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="w-24 text-center text-sm font-medium">{monthLabel}</span>
        <button
          type="button"
          onClick={() => onMonthChange(new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1))}
          aria-label="다음 달"
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border bg-border text-xs">
        {WEEKDAYS.map((w) => (
          <div key={w} className="bg-muted py-1 text-center font-medium text-muted-foreground">
            {w}
          </div>
        ))}
        {Array.from({ length: leadingBlanks }).map((_, i) => (
          <div key={`blank-${i}`} className={cn(cellHeightClassName, "bg-background/50")} />
        ))}
        {days.map((date) => {
          const dateStr = format(date, "yyyy-MM-dd");
          const info: MiniMonthCalendarDayInfo = { date, dateStr, isToday: dateStr === todayStr };
          const bars = renderBars?.(info) ?? [];
          return (
            <button
              key={dateStr}
              type="button"
              onClick={() => onDayClick?.(info)}
              className={cn(
                cellHeightClassName,
                "flex flex-col gap-0.5 bg-background pt-1 text-left transition-colors hover:bg-muted/70 disabled:cursor-default disabled:hover:bg-background",
              )}
            >
              <span className="px-1">{renderDay(info)}</span>
              {bars.map((pieces, i) => (
                <span key={i} className="flex h-1.5 w-full shrink-0 gap-px">
                  {pieces && pieces.length > 0 ? (
                    pieces.map((bar, j) => (
                      <span
                        key={j}
                        title={bar.title}
                        className={cn(
                          "block h-full flex-1",
                          // 경계에서만 살짝 여백을 두고 둥글게 마무리하고, 이어지는 중간 구간은
                          // 마진 없이 채워야 옆 셀의 막대와 진짜로 이어져 보인다. 한 레인에 조각이
                          // 2개면(당일 반납+재출고) 절반씩 나눠 그려 둘 다 보이게 한다.
                          bar.roundLeft ? "ml-0.5 rounded-l-full" : "ml-0",
                          bar.roundRight ? "mr-0.5 rounded-r-full" : "mr-0",
                          bar.className,
                        )}
                      />
                    ))
                  ) : (
                    <span className="block h-full w-full" />
                  )}
                </span>
              ))}
            </button>
          );
        })}
      </div>
    </div>
  );
}
