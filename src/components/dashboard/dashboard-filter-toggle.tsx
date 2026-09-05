"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDashboardFilter, type DashboardFilterMode } from "./dashboard-filter-scope";

export function DashboardFilterToggle() {
  const { mode, setMode } = useDashboardFilter();

  return (
    <Tabs value={mode} onValueChange={(v) => setMode(v as DashboardFilterMode)}>
      <TabsList>
        <TabsTrigger value="all">전체 보기</TabsTrigger>
        <TabsTrigger value="pinned">📌 내 관심만 보기</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
