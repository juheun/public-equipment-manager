import { createClient } from "@/lib/supabase/server";
import { toCsv, csvResponse, todayStamp } from "@/lib/csv";
import { EQUIPMENT_STATUS_META } from "@/lib/equipment-status";
import type { EquipmentRow } from "@/lib/supabase/types";

export async function GET() {
  const supabase = await createClient();

  const equipmentsRes = await supabase
    .from("equipments")
    .select("*")
    .eq("is_deleted", false)
    .order("maker")
    .order("capacity_kva")
    .order("serial_no")
    .returns<EquipmentRow[]>();

  if (equipmentsRes.error) {
    return new Response(equipmentsRes.error.message, { status: 500 });
  }

  const rows = [
    ["제조사", "용량(kVA)", "번호", "식별 라벨", "상태", "위치", "최근 오일교환일", "최근 오일교환 시점 아워미터"],
    ...(equipmentsRes.data ?? []).map((eq) => [
      eq.maker,
      eq.capacity_kva,
      eq.serial_no,
      eq.external_tag ?? "",
      eq.status ? (EQUIPMENT_STATUS_META[eq.status]?.label ?? eq.status) : "",
      eq.current_location ?? "",
      eq.last_oil_change_date ?? "",
      eq.last_oil_change_hours ?? "",
    ]),
  ];

  return csvResponse(`equipments_${todayStamp()}.csv`, toCsv(rows));
}
