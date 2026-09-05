"use client";

import { createContext, useCallback, useContext, useSyncExternalStore, type ReactNode } from "react";

type TextSizeLevel = 0 | 1 | 2 | 3 | 4;

const TEXT_SIZE_LEVELS: { level: TextSizeLevel; label: string; percent: number }[] = [
  { level: 0, label: "보통", percent: 100 },
  { level: 1, label: "조금 크게", percent: 110 },
  { level: 2, label: "크게", percent: 120 },
  { level: 3, label: "아주 크게", percent: 135 },
  { level: 4, label: "최대", percent: 150 },
];

const LEVEL_COUNT = TEXT_SIZE_LEVELS.length;

const STORAGE_KEY = "text-size-level";

function isValidLevel(value: number): value is TextSizeLevel {
  return Number.isInteger(value) && value >= 0 && value < LEVEL_COUNT;
}

function applyFontSize(percent: number) {
  document.documentElement.style.fontSize = `${percent}%`;
}

// localStorage는 React 상태가 아닌 외부 저장소이므로, "값을 읽어 setState한다"는
// useEffect 패턴 대신 useSyncExternalStore로 구독한다 — 서버에는 값이 없으니
// getServerSnapshot은 항상 보통(0)을 주고, 클라이언트에서 hydration 직후 실제 저장된
// 값으로 안전하게(mismatch 경고 없이) 갈아 끼운다. 같은 탭에서 setLevel로 값을 바꿀
// 때도 리스너를 직접 깨워 즉시 반영한다(storage 이벤트는 다른 탭에만 발생하므로).
let currentLevel: TextSizeLevel = 0;
if (typeof window !== "undefined") {
  try {
    const stored = Number(localStorage.getItem(STORAGE_KEY));
    if (isValidLevel(stored)) currentLevel = stored;
  } catch {
    // localStorage 접근 불가 환경(프라이빗 모드 등) — 기본값(보통) 유지
  }
}

const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function getSnapshot() {
  return currentLevel;
}

function getServerSnapshot(): TextSizeLevel {
  return 0;
}

function setGlobalLevel(next: TextSizeLevel) {
  currentLevel = next;
  applyFontSize(TEXT_SIZE_LEVELS[next].percent);
  try {
    localStorage.setItem(STORAGE_KEY, String(next));
  } catch {
    // 저장 실패해도 이번 세션 내 적용은 유지된다
  }
  listeners.forEach((listener) => listener());
}

interface TextSizeContextValue {
  level: TextSizeLevel;
  percent: number;
  label: string;
  setLevel: (level: TextSizeLevel) => void;
  cycle: () => void;
}

const TextSizeContext = createContext<TextSizeContextValue | null>(null);

export function TextSizeProvider({ children }: { children: ReactNode }) {
  const level = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setLevel = useCallback((next: TextSizeLevel) => setGlobalLevel(next), []);
  const cycle = useCallback(() => setGlobalLevel(((level + 1) % LEVEL_COUNT) as TextSizeLevel), [level]);

  const current = TEXT_SIZE_LEVELS[level];

  return (
    <TextSizeContext.Provider value={{ level, percent: current.percent, label: current.label, setLevel, cycle }}>
      {children}
    </TextSizeContext.Provider>
  );
}

export function useTextSize() {
  const ctx = useContext(TextSizeContext);
  if (!ctx) throw new Error("useTextSize는 TextSizeProvider 내부에서만 사용할 수 있습니다.");
  return ctx;
}
