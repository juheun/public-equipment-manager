import { useSyncExternalStore } from "react";

function subscribe() {
  return () => {};
}

function getSnapshot() {
  return true;
}

function getServerSnapshot() {
  return false;
}

/**
 * 서버에서는 항상 false, 클라이언트에서 hydration이 끝난 뒤에는 true를 반환한다.
 * next-themes의 resolvedTheme처럼 서버에서는 알 수 없는 값을 다루는 컴포넌트에서
 * "mounted" 플래그가 필요할 때, useEffect+setState 없이(react-hooks/set-state-in-effect
 * 규칙에 걸리지 않게) 같은 효과를 낸다.
 */
export function useIsClient(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
