"use client";

import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePins } from "@/components/shared/pins-provider";

export function FavoriteManageButton() {
  const { openFavoriteManager } = usePins();

  return (
    <Button size="sm" variant="outline" onClick={() => openFavoriteManager()}>
      <Star className="h-4 w-4" /> 관심 대상 일괄 설정
    </Button>
  );
}
