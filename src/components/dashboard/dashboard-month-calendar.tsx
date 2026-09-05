"use client";

import { useMemo } from "react";
import { MonthCalendar, type MonthCalendarDay } from "./month-calendar";
import { useDashboardFilterMode } from "./dashboard-filter-scope";
import { usePins } from "@/components/shared/pins-provider";
import { ALL_TEAMS, useTeamFilter } from "@/components/shared/team-filter-scope";

interface DashboardMonthCalendarProps {
  monthLabel: string;
  leadingBlanks: number;
  days: MonthCalendarDay[];
  prevMonthHref: string;
  nextMonthHref: string;
  todayMonthHref?: string;
}

export function DashboardMonthCalendar({ days, ...rest }: DashboardMonthCalendarProps) {
  const { pinnedSites } = usePins();
  const mode = useDashboardFilterMode();
  const { selectedTeamId } = useTeamFilter();

  const visibleDays = useMemo(() => {
    const byPinned = mode !== "pinned" ? days : days.map((d) => ({
      ...d,
      dispatchOrders: d.dispatchOrders.filter((o) => pinnedSites.has(o.siteName)),
      returnOrders: d.returnOrders.filter((o) => pinnedSites.has(o.siteName)),
    }));
    if (selectedTeamId === ALL_TEAMS) return byPinned;
    return byPinned.map((d) => ({
      ...d,
      dispatchOrders: d.dispatchOrders.filter((o) => o.teamId === selectedTeamId),
      returnOrders: d.returnOrders.filter((o) => o.teamId === selectedTeamId),
    }));
  }, [days, mode, pinnedSites, selectedTeamId]);

  return <MonthCalendar days={visibleDays} {...rest} />;
}
