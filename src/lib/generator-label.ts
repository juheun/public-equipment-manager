import type { EquipmentRow } from "@/lib/supabase/types";

type LabelSource = Pick<
  EquipmentRow,
  "maker" | "capacity_kva" | "serial_no" | "supplier_name" | "external_tag"
>;

/**
 * 발전기 표시명 — 번호(serial_no)가 있으면 "도요 300kVA 12번" 형태(RPC 쪽 equipment_label과
 * 동일 포맷). 번호가 없는 외부 차입 장비는 대신 "도요 300kVA (늘봄렌탈 늘봄 1호)"처럼
 * 차입처/식별 라벨로 구분한다.
 */
export function formatGeneratorLabel(eq: LabelSource): string {
  if (eq.serial_no != null) {
    return `${eq.maker} ${eq.capacity_kva}kVA ${eq.serial_no}번`;
  }
  const tag = [eq.supplier_name, eq.external_tag].filter(Boolean).join(" ");
  return `${eq.maker} ${eq.capacity_kva}kVA${tag ? ` (${tag})` : ""}`;
}
