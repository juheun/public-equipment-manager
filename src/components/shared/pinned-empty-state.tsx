"use client";

import { usePins } from "./pins-provider";
import type { PinTargetType } from "@/lib/supabase/types";

interface PinnedEmptyStateProps {
  tab: PinTargetType;
  className?: string;
}

export function PinnedEmptyState({ tab, className }: PinnedEmptyStateProps) {
  const { openFavoriteManager } = usePins();

  return (
    <p className={className ?? "py-8 text-center text-sm text-muted-foreground"}>
      📌 즐겨찾기한 현장이나 장비가 없습니다. 카드 우측 상단의 핀 아이콘을 누르거나{" "}
      <button
        type="button"
        onClick={() => openFavoriteManager(tab)}
        className="font-medium text-foreground underline underline-offset-2 hover:no-underline"
      >
        관심 대상 설정하기
      </button>
      를 눌러 등록하세요.
    </p>
  );
}
