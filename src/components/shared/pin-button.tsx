"use client";

import { Pin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PinButtonProps {
  pinned: boolean;
  onToggle: () => void;
  className?: string;
}

export function PinButton({ pinned, onToggle, className }: PinButtonProps) {
  return (
    <Button
      type="button"
      size="icon-sm"
      variant={pinned ? "secondary" : "outline"}
      className={cn(pinned && "text-amber-600 dark:text-amber-400", className)}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      aria-label={pinned ? "고정 해제" : "고정하기"}
      title={pinned ? "고정 해제" : "고정하기"}
    >
      <Pin className={cn("h-3.5 w-3.5", pinned && "fill-current")} />
    </Button>
  );
}
