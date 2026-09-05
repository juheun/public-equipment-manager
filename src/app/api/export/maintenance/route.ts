import { createClient } from "@/lib/supabase/server";
import { toCsv, csvResponse, todayStamp } from "@/lib/csv";
import { formatGeneratorLabel } from "@/lib/generator-label";
import type { EquipmentRow, MaintenanceLogRow } from "@/lib/supabase/types";

export async function GET() {
  const supabase = await createClient();

  const [logsRes, equipmentsRes] = await Promise.all([
    supabase.from("maintenance_logs").select("*").order("service_date", { ascending: false }).returns<MaintenanceLogRow[]>(),
    supabase.from("equipments").select("*").returns<EquipmentRow[]>(),
  ]);

  const error = logsRes.error ?? equipmentsRes.error;
  if (error) {
    return new Response(error.message, { status: 500 });
  }

  const equipmentLabelById = new Map((equipmentsRes.data ?? []).map((eq) => [eq.id, formatGeneratorLabel(eq)]));

  const rows = [
    ["장비명", "구분", "일자", "정비내용", "시점 아워미터", "메모"],
    ...(logsRes.data ?? []).map((log) => [
      log.equipment_id ? (equipmentLabelById.get(log.equipment_id) ?? "알 수 없는 장비") : "",
      log.log_type === "START" ? "입고" : "완료",
      log.service_date ?? "",
      log.service_type,
      log.service_hours ?? "",
      log.notes ?? "",
    ]),
  ];

  return csvResponse(`maintenance_${todayStamp()}.csv`, toCsv(rows));
}
