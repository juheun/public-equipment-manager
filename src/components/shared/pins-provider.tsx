"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { togglePin as togglePinAction, saveBatchPins as saveBatchPinsAction } from "@/app/actions/pins";
import { FavoriteManageModal } from "./favorite-manage-modal";
import type { PinTargetType } from "@/lib/supabase/types";

interface PinsContextValue {
  pinnedSites: Set<string>;
  pinnedEquipments: Set<string>;
  togglePin: (targetType: PinTargetType, targetId: string) => void;
  saveBatch: (targetType: PinTargetType, targetIds: string[]) => Promise<boolean>;
  openFavoriteManager: (initialTab?: PinTargetType) => void;
}

const PinsContext = createContext<PinsContextValue | null>(null);

export function usePins() {
  const ctx = useContext(PinsContext);
  if (!ctx) throw new Error("usePins()는 PinsProvider 내부에서만 사용할 수 있습니다.");
  return ctx;
}

interface PinsProviderProps {
  initialSites: string[];
  initialEquipments: string[];
  children: React.ReactNode;
}

// 브라우저 localStorage 대신 계정(user_pins 테이블) 기준으로 핀을 저장한다 — 로그인한
// 계정이면 PC/모바일 등 어느 기기에서 봐도 동일하다. 초기값은 (app)/layout.tsx가
// 서버에서 미리 조회해 내려주므로, 이 값 자체는 SSR/하이드레이션 사이에 절대
// 달라지지 않아(둘 다 같은 DB 조회 결과) 하이드레이션 불일치 걱정이 없다. 이후
// 토글/일괄 저장은 낙관적으로 로컬 상태를 먼저 바꾸고 서버 액션을 호출한다.
export function PinsProvider({ initialSites, initialEquipments, children }: PinsProviderProps) {
  const [pinnedSites, setPinnedSites] = useState<Set<string>>(() => new Set(initialSites));
  const [pinnedEquipments, setPinnedEquipments] = useState<Set<string>>(() => new Set(initialEquipments));
  const [modalOpen, setModalOpen] = useState(false);
  const [modalInitialTab, setModalInitialTab] = useState<PinTargetType>("site");

  const togglePin = useCallback(
    (targetType: PinTargetType, targetId: string) => {
      const currentSet = targetType === "site" ? pinnedSites : pinnedEquipments;
      const setter = targetType === "site" ? setPinnedSites : setPinnedEquipments;
      const willBePinned = !currentSet.has(targetId);

      setter((prev) => {
        const next = new Set(prev);
        if (willBePinned) next.add(targetId);
        else next.delete(targetId);
        return next;
      });

      togglePinAction(targetType, targetId).then((result) => {
        if (!result.success) {
          // 서버 반영에 실패하면 낙관적으로 바꿨던 상태를 되돌린다.
          setter((prev) => {
            const next = new Set(prev);
            if (willBePinned) next.delete(targetId);
            else next.add(targetId);
            return next;
          });
        }
      });
    },
    [pinnedSites, pinnedEquipments],
  );

  const saveBatch = useCallback(
    async (targetType: PinTargetType, targetIds: string[]) => {
      const setter = targetType === "site" ? setPinnedSites : setPinnedEquipments;
      const previous = targetType === "site" ? pinnedSites : pinnedEquipments;

      setter(new Set(targetIds));
      const result = await saveBatchPinsAction(targetType, targetIds);
      if (!result.success) setter(previous);
      return result.success;
    },
    [pinnedSites, pinnedEquipments],
  );

  const openFavoriteManager = useCallback((initialTab: PinTargetType = "site") => {
    setModalInitialTab(initialTab);
    setModalOpen(true);
  }, []);

  return (
    <PinsContext.Provider
      value={{ pinnedSites, pinnedEquipments, togglePin, saveBatch, openFavoriteManager }}
    >
      {children}
      <FavoriteManageModal open={modalOpen} onOpenChange={setModalOpen} initialTab={modalInitialTab} />
    </PinsContext.Provider>
  );
}
