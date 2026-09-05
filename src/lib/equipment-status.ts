import type { EquipmentRow, RentalOrderStatus } from "@/lib/supabase/types";

export const EQUIPMENT_STATUS_META: Record<
  NonNullable<EquipmentRow["status"]>,
  { label: string; badgeClassName: string }
> = {
  AVAILABLE: {
    label: "대기",
    badgeClassName: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  },
  RENTED: {
    label: "출고중",
    badgeClassName: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  },
  MAINTENANCE: {
    label: "점검/수리중",
    badgeClassName: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  },
};

export const RENTAL_ORDER_STATUS_META: Record<
  NonNullable<RentalOrderStatus>,
  { label: string; badgeClassName: string }
> = {
  ACTIVE: {
    label: "현장출고",
    badgeClassName: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  },
  COMPLETED: {
    label: "완료",
    badgeClassName: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  },
};
