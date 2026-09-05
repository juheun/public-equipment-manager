"use client";

import { createContext, useCallback, useContext, useSyncExternalStore } from "react";
import { useCurrentUserEmail } from "@/components/auth/user-email-provider";
import type { TeamRow, UserRole } from "@/lib/supabase/types";

/** "전체 팀"을 뜻하는 selectedTeamId 특수값. */
export const ALL_TEAMS = "ALL";

function isValidTeamId(v: string | null, teams: TeamRow[]): v is string {
  return v === ALL_TEAMS || (!!v && teams.some((t) => t.id === v));
}

const listenersByKey = new Map<string, Set<() => void>>();

function subscribe(storageKey: string, onStoreChange: () => void) {
  let listeners = listenersByKey.get(storageKey);
  if (!listeners) {
    listeners = new Set();
    listenersByKey.set(storageKey, listeners);
  }
  listeners.add(onStoreChange);

  // 다른 탭에서 값을 바꾼 경우까지 반영하기 위한 보조 구독(같은 탭 내 변경은
  // storage 이벤트가 발생하지 않으므로 setSelectedTeamId에서 notify()로 직접 처리한다).
  const handleStorage = (e: StorageEvent) => {
    if (e.key === storageKey) onStoreChange();
  };
  window.addEventListener("storage", handleStorage);

  return () => {
    listeners.delete(onStoreChange);
    window.removeEventListener("storage", handleStorage);
  };
}

function notify(storageKey: string) {
  for (const listener of listenersByKey.get(storageKey) ?? []) listener();
}

interface TeamFilterContextValue {
  role: UserRole | null;
  ownTeamId: string | null;
  ownTeamName: string | null;
  /** 전체 팀 목록 — ADMIN 드롭다운에서 사용 */
  teams: TeamRow[];
  /** 팀 UUID 또는 ALL_TEAMS. MEMBER는 항상 본인 소속 팀으로 고정된다(변경 불가). */
  selectedTeamId: string;
  /** ADMIN만 실제로 값이 바뀐다 — MEMBER가 호출해도 아무 일도 일어나지 않는다. */
  setSelectedTeamId: (id: string) => void;
}

const TeamFilterContext = createContext<TeamFilterContextValue | null>(null);

export function useTeamFilter() {
  const ctx = useContext(TeamFilterContext);
  if (!ctx) throw new Error("useTeamFilter()는 TeamFilterScope 내부에서만 사용할 수 있습니다.");
  return ctx;
}

interface TeamFilterScopeProps {
  role: UserRole | null;
  ownTeamId: string | null;
  ownTeamName: string | null;
  teams: TeamRow[];
  children: React.ReactNode;
}

// 헤더의 팀 선택기와 대시보드/캘린더가 함께 참조하는 "지금 어느 팀 기준으로 보고
// 있는지"를 컨텍스트로 공유한다. ADMIN(총괄 관리자)만 실제로 팀을 바꿔볼 수 있고,
// MEMBER는 본인 소속 팀으로 항상 고정된다 — 그래서 localStorage 값도 ADMIN에
// 한해서만 읽고 쓴다(MEMBER 계정에 남아있던 예전 선택값이 있어도 무시).
//
// localStorage에 저장해 같은 브라우저에서는 탭을 닫았다 열어도 마지막 선택이
// 유지된다. 계정별로 키를 분리하는 것도 DashboardFilterScope와 동일한 이유다
// (사내 공용 PC에서 여러 계정을 돌려쓰는 경우 값이 섞이면 곤란하기 때문).
export function TeamFilterScope({ role, ownTeamId, ownTeamName, teams, children }: TeamFilterScopeProps) {
  const userEmail = useCurrentUserEmail();
  const storageKey = `dashboard_team_filter_${userEmail}`;
  const isAdmin = role === "ADMIN";
  const fixedTeamId = ownTeamId ?? ALL_TEAMS;

  const getSnapshot = useCallback(() => {
    if (!isAdmin) return fixedTeamId;
    try {
      const raw = window.localStorage.getItem(storageKey);
      return isValidTeamId(raw, teams) ? raw : ALL_TEAMS;
    } catch {
      return ALL_TEAMS;
    }
  }, [isAdmin, fixedTeamId, storageKey, teams]);

  // 서버 렌더링 및 클라이언트 첫 렌더(하이드레이션)에서는 항상 이 값을 반환해야
  // 서버/클라이언트가 일치한다 — 실제 localStorage 값은 하이드레이션 이후
  // useSyncExternalStore가 자동으로 다시 렌더링하며 반영한다.
  const getServerSnapshot = useCallback(() => (isAdmin ? ALL_TEAMS : fixedTeamId), [isAdmin, fixedTeamId]);

  const selectedTeamId = useSyncExternalStore(
    useCallback((onStoreChange) => subscribe(storageKey, onStoreChange), [storageKey]),
    getSnapshot,
    getServerSnapshot,
  );

  const setSelectedTeamId = useCallback(
    (next: string) => {
      if (!isAdmin) return;
      try {
        window.localStorage.setItem(storageKey, next);
      } catch {
        // 프라이빗 브라우징 등으로 저장이 막혀도 있는 그대로 진행한다.
      }
      notify(storageKey);
    },
    [isAdmin, storageKey],
  );

  return (
    <TeamFilterContext.Provider value={{ role, ownTeamId, ownTeamName, teams, selectedTeamId, setSelectedTeamId }}>
      {children}
    </TeamFilterContext.Provider>
  );
}
