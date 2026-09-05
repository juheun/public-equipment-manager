"use client";

import { createContext, useCallback, useContext, useSyncExternalStore } from "react";
import { useCurrentUserEmail } from "@/components/auth/user-email-provider";

export type DashboardFilterMode = "all" | "pinned";

function isValidMode(v: string | null): v is DashboardFilterMode {
  return v === "all" || v === "pinned";
}

function getSnapshot(storageKey: string): DashboardFilterMode {
  const raw = window.localStorage.getItem(storageKey);
  return isValidMode(raw) ? raw : "all";
}

// 서버 렌더링 및 클라이언트 첫 렌더(하이드레이션)에서는 항상 "all"을 반환해야
// 서버/클라이언트가 일치한다 — 실제 localStorage 값은 하이드레이션 이후
// useSyncExternalStore가 자동으로 다시 렌더링하며 반영한다.
function getServerSnapshot(): DashboardFilterMode {
  return "all";
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
  // storage 이벤트가 발생하지 않으므로 setMode에서 notify()로 직접 처리한다).
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

interface DashboardFilterContextValue {
  mode: DashboardFilterMode;
  setMode: (mode: DashboardFilterMode) => void;
}

const DashboardFilterContext = createContext<DashboardFilterContextValue | null>(null);

export function useDashboardFilterMode() {
  const ctx = useContext(DashboardFilterContext);
  if (!ctx) throw new Error("useDashboardFilterMode()는 DashboardFilterScope 내부에서만 사용할 수 있습니다.");
  return ctx.mode;
}

export function useDashboardFilter() {
  const ctx = useContext(DashboardFilterContext);
  if (!ctx) throw new Error("useDashboardFilter()는 DashboardFilterScope 내부에서만 사용할 수 있습니다.");
  return ctx;
}

interface DashboardFilterScopeProps {
  children: React.ReactNode;
}

// 진행중인 대여(현장)/긴급 점검 리스트/KPI 카드/캘린더가 함께 참조하는 필터 모드를
// 컨텍스트로 공유한다(위젯들이 JSX 상 서로 떨어져 있어 prop으로 내려주기보다 이 편이
// 자연스럽다). 토글 UI 자체는 렌더링하지 않는다 — 타이틀 행에 위치한
// DashboardFilterToggle이 이 컨텍스트를 구독해서 그린다.
//
// localStorage에 저장해 같은 브라우저에서는 탭을 닫았다 열어도 마지막 선택이
// 유지된다(계정 간 동기화가 필요한 데이터가 아니라 순수 화면 상태라 DB보다
// localStorage가 맞다). 다만 사내 공용 PC처럼 같은 브라우저를 여러 계정이 돌려쓰는
// 경우 값이 섞이면 곤란하므로, 키에 로그인 이메일을 넣어 계정별로 격리한다.
export function DashboardFilterScope({ children }: DashboardFilterScopeProps) {
  const userEmail = useCurrentUserEmail();
  const storageKey = `dashboard_filter_mode_${userEmail}`;

  const mode = useSyncExternalStore(
    useCallback((onStoreChange) => subscribe(storageKey, onStoreChange), [storageKey]),
    () => getSnapshot(storageKey),
    getServerSnapshot,
  );

  const setMode = useCallback(
    (next: DashboardFilterMode) => {
      try {
        window.localStorage.setItem(storageKey, next);
      } catch {
        // 프라이빗 브라우징 등으로 저장이 막혀도 있는 그대로 진행한다(이번 탭 안에서는
        // notify()로 리렌더는 트리거되지만 값 자체는 저장 전 상태로 남는다).
      }
      notify(storageKey);
    },
    [storageKey],
  );

  return <DashboardFilterContext.Provider value={{ mode, setMode }}>{children}</DashboardFilterContext.Provider>;
}
