import type { RentalOrderEquipmentRow, RentalOrderRow, RentalOrderStatus } from "@/lib/supabase/types";

export interface EquipmentHistoryEntry {
  id: string;
  orderId: string;
  orderNumber: string;
  clientName: string;
  siteName: string;
  orderStatus: RentalOrderStatus | null;
  /** 이 대여를 등록한 팀 — 미배정이면 null. "본인 팀 기록만 보기" 필터링에 사용. */
  teamId: string | null;
  /** 현장 반입일 */
  dispatchDate: string;
  /** 현장 반출(완료 또는 예정)일 — 아직 반출되지 않았으면 null */
  returnDate: string | null;
  tigCount: number;
  co2Count: number;
}

/**
 * rental_order_equipments + rental_orders 를 장비별 이력 목록으로 묶는다.
 * 날짜 구간 제한 없이 전체를 반환 — 장비 상세 모달의 미니 캘린더가 임의의 달을
 * 넘나들며 조회하므로, 특정 기간으로 미리 잘라두면 과거/미래 달 탐색이 깨진다.
 */
export function buildEquipmentHistoryList(
  orderEquipments: RentalOrderEquipmentRow[],
  orders: RentalOrderRow[],
): Record<string, EquipmentHistoryEntry[]> {
  const ordersById = new Map(orders.map((o) => [o.id, o]));
  const result: Record<string, EquipmentHistoryEntry[]> = {};

  for (const oe of orderEquipments) {
    if (!oe.equipment_id || !oe.order_id) continue;
    const order = ordersById.get(oe.order_id);
    if (!order) continue;

    const entry: EquipmentHistoryEntry = {
      id: oe.id,
      orderId: order.id,
      orderNumber: order.order_number,
      clientName: order.client_name,
      siteName: order.site_name,
      orderStatus: order.status,
      teamId: order.team_id,
      dispatchDate: order.dispatch_date,
      returnDate: order.return_date,
      tigCount: order.tig_count,
      co2Count: order.co2_count,
    };

    (result[oe.equipment_id] ??= []).push(entry);
  }

  for (const entries of Object.values(result)) {
    entries.sort((a, b) => a.dispatchDate.localeCompare(b.dispatchDate));
  }

  return result;
}
