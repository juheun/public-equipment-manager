"use client";

import { Button } from "@/components/ui/button";
import { useTextSize } from "./text-size-provider";

// [가A] 아이콘 버튼 — 클릭할 때마다 보통(100%) -> 크게(112%) -> 아주 크게(125%)
// 순서로 순환한다. 우측 상단의 작은 배지가 현재 단계(1/2/3)를 항상 보여준다.
export function TextSizeToggle() {
  const { level, percent, label, cycle } = useTextSize();

  return (
    <Button
      type="button"
      size="icon-sm"
      variant="ghost"
      className="relative"
      aria-label={`글자 크기: ${label} (${percent}%) — 클릭하면 다음 단계로 전환됩니다`}
      title={`글자 크기: ${label} (${percent}%)`}
      onClick={cycle}
    >
      <span className="flex items-baseline leading-none" aria-hidden="true">
        <span className="text-[13px] font-bold">가</span>
        <span className="text-[9px] font-bold">A</span>
      </span>
      <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-[9px] leading-none font-bold text-primary-foreground">
        {level + 1}
      </span>
    </Button>
  );
}
