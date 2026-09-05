"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { RENTAL_ORDER_STATUS_META } from "@/lib/equipment-status";
import { CALENDAR_STATUS_STYLE, type CalendarVisualStatus } from "@/lib/calendar-status-style";
import { WelderBadges } from "./rental-orders-panel";
import { cn } from "@/lib/utils";
import type { EquipmentRow, RentalOrderStatus } from "@/lib/supabase/types";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** 일별 상세 팝업의 장비 뱃지에 필요한 최소 필드 — 대여 카드(rental-orders-panel.tsx)와
 * 달리 이 팝업은 "[번호번 · 제조사 용량kVA]" 형태의 알약형 배지를 직접 조립하므로,
 * 미리 포맷된 문자열이 아니라 원본 필드를 그대로 받는다. */
export type DayEquipmentItem = Pick<
  EquipmentRow,
  "id" | "serial_no" | "maker" | "capacity_kva" | "supplier_name" | "external_tag"
>;

export interface DayOrderInfo {
  id: string;
  clientName: string;
  siteName: string;
  status: RentalOrderStatus | null;
  dispatchDate: string;
  returnDate: string | null;
  teamId: string | null;
  teamName: string | null;
  tigCount: number;
  co2Count: number;
  equipmentItems: DayEquipmentItem[];
}

// 발전기: "12번 · 도요 300kVA" / 번호 없는 외부 차입 장비: "늘봄렌탈 늘봄 1호 · 300kVA".
function formatDayEquipmentChip(eq: DayEquipmentItem): string {
  if (eq.serial_no != null) {
    return `${eq.serial_no}번 · ${eq.maker} ${eq.capacity_kva}kVA`;
  }
  const tag = [eq.supplier_name, eq.external_tag].filter(Boolean).join(" ") || eq.maker;
  return `${tag} · ${eq.capacity_kva}kVA`;
}

export interface MonthCalendarDay {
  day: number;
  dateStr: string;
  isToday: boolean;
  dispatchOrders: DayOrderInfo[];
  returnOrders: DayOrderInfo[];
}

interface MonthCalendarProps {
  monthLabel: string;
  leadingBlanks: number;
  days: MonthCalendarDay[];
  prevMonthHref: string;
  nextMonthHref: string;
  /** 현재 이번 달을 보고 있으면 undefined (버튼 숨김) */
  todayMonthHref?: string;
}

export function MonthCalendar({
  monthLabel,
  leadingBlanks,
  days,
  prevMonthHref,
  nextMonthHref,
  todayMonthHref,
}: MonthCalendarProps) {
  const [selectedDay, setSelectedDay] = useState<MonthCalendarDay | null>(null);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Button
            size="icon-sm"
            variant="ghost"
            nativeButton={false}
            render={<Link href={prevMonthHref} aria-label="이전 달" />}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="w-28 text-center text-base font-semibold">{monthLabel}</h2>
          <Button
            size="icon-sm"
            variant="ghost"
            nativeButton={false}
            render={<Link href={nextMonthHref} aria-label="다음 달" />}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          {todayMonthHref && (
            <Button
              size="sm"
              variant="outline"
              nativeButton={false}
              className="ml-1 h-7 text-xs"
              render={<Link href={todayMonthHref} />}
            >
              오늘
            </Button>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-blue-500" /> 반입
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-orange-500" /> 반출
          </span>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border bg-border text-sm">
        {WEEKDAYS.map((w) => (
          <div key={w} className="bg-muted py-2 text-center text-xs font-medium text-muted-foreground">
            {w}
          </div>
        ))}
        {Array.from({ length: leadingBlanks }).map((_, i) => (
          <div key={`blank-${i}`} className="min-h-20 bg-background/50" />
        ))}
        {days.map((d) => {
          const hasOrders = d.dispatchOrders.length > 0 || d.returnOrders.length > 0;
          return (
            <button
              key={d.day}
              type="button"
              disabled={!hasOrders}
              onClick={() => setSelectedDay(d)}
              className={cn(
                "flex min-h-20 flex-col gap-1 bg-background p-1.5 text-left transition-colors",
                d.isToday && "ring-2 ring-inset ring-primary",
                hasOrders ? "cursor-pointer hover:bg-muted/70" : "cursor-default",
              )}
            >
              <span className={cn("text-xs", d.isToday && "font-bold text-primary")}>{d.day}</span>
              <div className="flex flex-wrap gap-1">
                {d.dispatchOrders.length > 0 && (
                  <span className="rounded bg-blue-100 px-1 text-[10px] leading-4 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                    입{d.dispatchOrders.length}
                  </span>
                )}
                {d.returnOrders.length > 0 && (
                  <span className="rounded bg-orange-100 px-1 text-[10px] leading-4 text-orange-800 dark:bg-orange-950 dark:text-orange-300">
                    출{d.returnOrders.length}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <Dialog
        open={selectedDay != null}
        onOpenChange={(open) => {
          if (!open) setSelectedDay(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedDay?.dateStr}</DialogTitle>
            <DialogDescription>현장 반입/반출 대여 건</DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            {selectedDay && selectedDay.dispatchOrders.length > 0 && (
              <section>
                <h3 className="mb-2 text-sm font-medium text-muted-foreground">현장 반입</h3>
                <ul className="space-y-1.5">
                  {selectedDay.dispatchOrders.map((o) => (
                    <OrderRow key={o.id} order={o} />
                  ))}
                </ul>
              </section>
            )}
            {selectedDay && selectedDay.returnOrders.length > 0 && (
              <section>
                <h3 className="mb-2 text-sm font-medium text-muted-foreground">현장 반출</h3>
                <ul className="space-y-1.5">
                  {selectedDay.returnOrders.map((o) => (
                    <OrderRow key={o.id} order={o} />
                  ))}
                </ul>
              </section>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const ORDER_STATUS_TO_CALENDAR: Partial<Record<NonNullable<RentalOrderStatus>, CalendarVisualStatus>> = {
  ACTIVE: "ACTIVE",
  COMPLETED: "RETURNED",
};

function OrderRow({ order }: { order: DayOrderInfo }) {
  const calendarStatus = order.status ? ORDER_STATUS_TO_CALENDAR[order.status] : undefined;
  const statusMeta = order.status ? RENTAL_ORDER_STATUS_META[order.status] : undefined;
  const hasEquipmentInfo = order.equipmentItems.length > 0 || order.tigCount > 0 || order.co2Count > 0;
  return (
    <li className="rounded-md border px-2.5 py-2 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 break-keep font-medium">
          {order.siteName} <span className="font-normal text-muted-foreground">({order.clientName})</span>
        </span>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {calendarStatus ? (
            <Badge className={cn("hover:opacity-100", CALENDAR_STATUS_STYLE[calendarStatus].badgeClassName)}>
              {statusMeta?.label}
            </Badge>
          ) : (
            statusMeta && (
              <Badge className={cn("hover:bg-inherit", statusMeta.badgeClassName)}>{statusMeta.label}</Badge>
            )
          )}
          <Badge className="border border-slate-500/30 bg-slate-500/10 text-slate-700 hover:bg-slate-500/10 dark:text-slate-300">
            {order.teamName ?? "팀 미배정"}
          </Badge>
        </div>
      </div>
      {hasEquipmentInfo && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {order.equipmentItems.map((eq) => (
            <span
              key={eq.id}
              className="rounded bg-muted px-1.5 py-0.5 text-xs whitespace-normal break-keep text-muted-foreground"
            >
              [{formatDayEquipmentChip(eq)}]
            </span>
          ))}
          <WelderBadges tigCount={order.tigCount} co2Count={order.co2Count} />
        </div>
      )}
    </li>
  );
}
