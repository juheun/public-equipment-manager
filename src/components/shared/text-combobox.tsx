"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

interface TextComboboxProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  newItemLabel?: (query: string) => string;
  className?: string;
}

/**
 * 기존 값 중 검색해서 선택하거나, 없는 값이면 그대로 입력해 새로 등록하는 콤보박스.
 * 거래처/현장명/보관 위치 등 "자동완성 + 자유 입력"이 필요한 모든 텍스트 필드에서 공용으로 쓴다.
 */
export function TextCombobox({
  id,
  value,
  onChange,
  options,
  placeholder = "기존 항목 선택 또는 신규 입력",
  searchPlaceholder = "검색 또는 신규 입력",
  emptyText = "일치하는 항목이 없습니다.",
  newItemLabel = (q) => `신규로 등록: "${q}"`,
  className,
}: TextComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  function select(v: string) {
    onChange(v);
    setOpen(false);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        // 열 때 검색어를 비워 전체 목록부터 보여준다. 확정된 값으로 미리 채워두면
        // 그 값 하나로만 필터링돼 다른 항목을 고르기 어려워진다.
        if (o) setQuery("");
      }}
    >
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            className={cn("w-full justify-between font-normal", className)}
          />
        }
      >
        <span className={cn("truncate", !value && "text-muted-foreground")}>{value || placeholder}</span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-(--anchor-width) min-w-56 p-0" align="start">
        <Command>
          <CommandInput value={query} onValueChange={setQuery} placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((opt) => (
                <CommandItem key={opt} value={opt} onSelect={() => select(opt)}>
                  <Check className={cn("h-4 w-4", value === opt ? "opacity-100" : "opacity-0")} />
                  {opt}
                </CommandItem>
              ))}
            </CommandGroup>
            {query.trim() !== "" && !options.some((o) => o === query.trim()) && (
              <CommandGroup>
                <CommandItem value={query} onSelect={() => select(query.trim())}>
                  <Plus className="h-4 w-4" />
                  {newItemLabel(query.trim())}
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
