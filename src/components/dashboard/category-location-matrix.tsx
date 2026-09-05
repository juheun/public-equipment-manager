"use client";

import { cn } from "@/lib/utils";
import type { EquipmentRow } from "@/lib/supabase/types";

interface CategoryLocationMatrixProps {
  equipments: EquipmentRow[];
}

interface SubRow {
  key: string;
  label: string;
  total: number;
  available: number;
  rented: number;
  repair: number;
}

interface MatrixRow extends SubRow {
  subRows: SubRow[];
}

// rem 단위를 써야 글자 크기 배율(루트 폰트 스케일링)에 맞춰 숫자 열도 함께 늘어난다
// — px 고정값은 배율이 커져도 그대로라 150%에서 숫자 뱃지가 겹칠 수 있다.
const ROW_GRID = "grid grid-cols-[1fr_3.5rem_3.5rem_3.5rem_3.5rem] items-center gap-2";

function CountCell({ value, className }: { value: number; className?: string }) {
  if (value === 0) {
    return <span className="text-center text-xs text-muted-foreground">-</span>;
  }
  return (
    <span className={cn("rounded px-1.5 py-0.5 text-center text-sm font-semibold tabular-nums", className)}>
      {value}
    </span>
  );
}

const AVAILABLE_CLASS = "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300";
const RENTED_CLASS = "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300";
const REPAIR_CLASS = "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300";

export function CategoryLocationMatrix({ equipments }: CategoryLocationMatrixProps) {
  const rows: MatrixRow[] = [];

  // 발전기 — 개별 관리 자산이므로 용량(kVA)별 소계를 서랍 세부 행으로 보여준다.
  if (equipments.length > 0) {
    const byCapacity = new Map<number, EquipmentRow[]>();
    for (const eq of equipments) {
      const list = byCapacity.get(eq.capacity_kva) ?? [];
      list.push(eq);
      byCapacity.set(eq.capacity_kva, list);
    }

    const subRows: SubRow[] = Array.from(byCapacity.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([kva, eqs]) => ({
        key: `generator-${kva}`,
        label: `${kva}kVA`,
        total: eqs.length,
        available: eqs.filter((eq) => eq.status === "AVAILABLE").length,
        rented: eqs.filter((eq) => eq.status === "RENTED").length,
        repair: eqs.filter((eq) => eq.status === "MAINTENANCE").length,
      }));

    rows.push({
      key: "generator",
      label: "발전기",
      total: equipments.length,
      available: equipments.filter((eq) => eq.status === "AVAILABLE").length,
      rented: equipments.filter((eq) => eq.status === "RENTED").length,
      repair: equipments.filter((eq) => eq.status === "MAINTENANCE").length,
      subRows,
    });
  }

  if (rows.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-lg border">
      <div className="min-w-[32.5rem]">
        <div className={cn(ROW_GRID, "border-b bg-muted/40 px-3 py-2 text-xs text-muted-foreground")}>
          <span>카테고리</span>
          <span className="text-center">총 보유</span>
          <span className="text-center">대기</span>
          <span className="text-center">출고</span>
          <span className="text-center">수리중</span>
        </div>

        {rows.map((row) => (
          <div key={row.key} className="border-b last:border-b-0">
            <div className={cn(ROW_GRID, "px-3 py-2.5 text-sm")}>
              <span className="font-medium">{row.label}</span>
              <CountCell value={row.total} />
              <CountCell value={row.available} className={AVAILABLE_CLASS} />
              <CountCell value={row.rented} className={RENTED_CLASS} />
              <CountCell value={row.repair} className={REPAIR_CLASS} />
            </div>

            <div className="space-y-0.5 bg-muted/20 px-3 py-1.5">
              {row.subRows.map((sub) => (
                <div key={sub.key} className={cn(ROW_GRID, "py-1 pl-5 text-xs")}>
                  <span className="break-keep text-muted-foreground">{sub.label}</span>
                  <CountCell value={sub.total} />
                  <CountCell value={sub.available} className={AVAILABLE_CLASS} />
                  <CountCell value={sub.rented} className={RENTED_CLASS} />
                  <CountCell value={sub.repair} className={REPAIR_CLASS} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
