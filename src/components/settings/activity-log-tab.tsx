"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { ActivityAction, ActivityLogRow, ActivityTargetType } from "@/lib/supabase/types";

interface ActivityLogTabProps {
  logs: ActivityLogRow[];
}

const ALL_VALUE = "ALL";

const ACTION_META: Record<ActivityAction, { label: string; badgeClassName: string }> = {
  CREATE: { label: "등록", badgeClassName: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  UPDATE: { label: "수정", badgeClassName: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300" },
  DELETE: { label: "삭제/폐기", badgeClassName: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" },
  DISPATCH: { label: "출고", badgeClassName: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300" },
  RETURN: { label: "반납", badgeClassName: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300" },
};

const TARGET_TYPE_LABEL: Record<ActivityTargetType, string> = {
  EQUIPMENT: "장비",
  ORDER: "대여 주문",
  CLIENT: "거래처",
  LOCATION: "장소",
};

export function ActivityLogTab({ logs }: ActivityLogTabProps) {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [actionFilter, setActionFilter] = useState(ALL_VALUE);
  const [targetTypeFilter, setTargetTypeFilter] = useState(ALL_VALUE);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return logs.filter((log) => {
      const dateStr = log.created_at?.slice(0, 10) ?? "";
      if (fromDate && dateStr < fromDate) return false;
      if (toDate && dateStr > toDate) return false;
      if (actionFilter !== ALL_VALUE && log.action !== actionFilter) return false;
      if (targetTypeFilter !== ALL_VALUE && log.target_type !== targetTypeFilter) return false;
      if (
        normalizedQuery &&
        !log.description.toLowerCase().includes(normalizedQuery) &&
        !(log.user_email ?? "").toLowerCase().includes(normalizedQuery)
      ) {
        return false;
      }
      return true;
    });
  }, [logs, fromDate, toDate, actionFilter, targetTypeFilter, query]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">작업 로그</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="text-xs text-muted-foreground">시작일</label>
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="mt-1 h-8 w-36" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">종료일</label>
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="mt-1 h-8 w-36" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">작업 유형</label>
            <Select value={actionFilter} onValueChange={(v) => setActionFilter(v ?? ALL_VALUE)}>
              <SelectTrigger size="sm" className="mt-1 w-36">
                <SelectValue>
                  {(value: string | null) =>
                    !value || value === ALL_VALUE ? "전체" : (ACTION_META[value as ActivityAction]?.label ?? value)
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>전체</SelectItem>
                {(Object.keys(ACTION_META) as ActivityAction[]).map((action) => (
                  <SelectItem key={action} value={action}>
                    {ACTION_META[action].label} ({action})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">대상</label>
            <Select value={targetTypeFilter} onValueChange={(v) => setTargetTypeFilter(v ?? ALL_VALUE)}>
              <SelectTrigger size="sm" className="mt-1 w-32">
                <SelectValue>
                  {(value: string | null) =>
                    !value || value === ALL_VALUE
                      ? "전체"
                      : (TARGET_TYPE_LABEL[value as ActivityTargetType] ?? value)
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>전체</SelectItem>
                {(Object.keys(TARGET_TYPE_LABEL) as ActivityTargetType[]).map((t) => (
                  <SelectItem key={t} value={t}>
                    {TARGET_TYPE_LABEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="relative flex-1 min-w-48">
            <label className="text-xs text-muted-foreground">검색 (내용 / 담당자)</label>
            <div className="relative mt-1">
              <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="전표번호, 장비명, 이메일 등"
                className="h-8 pl-8"
              />
            </div>
          </div>
          <p className="ml-auto pb-1.5 text-xs text-muted-foreground">
            {filtered.length}건 / 최근 {logs.length}건
          </p>
        </div>

        {filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">조건에 맞는 로그가 없습니다.</p>
        ) : (
          <ul className="max-h-[32rem] space-y-1.5 overflow-y-auto">
            {filtered.map((log) => {
              const meta = ACTION_META[log.action];
              return (
                <li key={log.id} className="rounded-md border px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <Badge className={cn("hover:bg-inherit", meta?.badgeClassName)}>{meta?.label ?? log.action}</Badge>
                      <span className="text-xs text-muted-foreground">{TARGET_TYPE_LABEL[log.target_type] ?? log.target_type}</span>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {log.created_at ? log.created_at.replace("T", " ").slice(0, 19) : "-"}
                    </span>
                  </div>
                  <p className="mt-1">{log.description}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{log.user_email ?? "system"}</p>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
