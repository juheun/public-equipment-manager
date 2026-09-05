"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ALL_TEAMS, useTeamFilter } from "./team-filter-scope";

/** 헤더 우측의 팀 정보 표시 — ADMIN은 조회할 팀을 고를 수 있는 드롭다운, MEMBER는
 * 본인 소속 팀명을 보여주는 읽기 전용 뱃지다. */
export function TeamSelector() {
  const { role, ownTeamName, teams, selectedTeamId, setSelectedTeamId } = useTeamFilter();

  if (role !== "ADMIN") {
    if (!ownTeamName) return null;
    return (
      <span className="hidden items-center rounded-full bg-muted px-2.5 py-1 text-xs font-medium whitespace-nowrap text-muted-foreground sm:inline-flex">
        소속: {ownTeamName}
      </span>
    );
  }

  return (
    <Select value={selectedTeamId} onValueChange={(v) => v && setSelectedTeamId(v)}>
      <SelectTrigger size="sm" className="h-8 w-28 text-xs" aria-label="조회할 팀 선택">
        <SelectValue>
          {(value: string | null) =>
            !value || value === ALL_TEAMS ? "전체" : (teams.find((t) => t.id === value)?.name ?? "전체")
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_TEAMS}>전체</SelectItem>
        {teams.map((t) => (
          <SelectItem key={t.id} value={t.id}>
            {t.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
