import { createClient } from "@/lib/supabase/server";
import { toCsv, csvResponse, todayStamp } from "@/lib/csv";
import { RENTAL_ORDER_STATUS_META } from "@/lib/equipment-status";
import { formatGeneratorLabel } from "@/lib/generator-label";
import type { EquipmentRow, RentalOrderEquipmentRow, RentalOrderRow } from "@/lib/supabase/types";

export async function GET() {
  const supabase = await createClient();

  const [ordersRes, orderEqRes, equipmentsRes] = await Promise.all([
    supabase.from("rental_orders").select("*").order("dispatch_date", { ascending: false }).returns<RentalOrderRow[]>(),
    supabase.from("rental_order_equipments").select("*").returns<RentalOrderEquipmentRow[]>(),
    supabase.from("equipments").select("*").returns<EquipmentRow[]>(),
  ]);

  const error = ordersRes.error ?? orderEqRes.error ?? equipmentsRes.error;
  if (error) {
    return new Response(error.message, { status: 500 });
  }

  const equipmentLabelById = new Map((equipmentsRes.data ?? []).map((eq) => [eq.id, formatGeneratorLabel(eq)]));

  const equipmentLabelsByOrderId = new Map<string, string[]>();
  for (const oe of orderEqRes.data ?? []) {
    if (!oe.order_id || !oe.equipment_id) continue;
    const label = equipmentLabelById.get(oe.equipment_id);
    if (!label) continue;
    const list = equipmentLabelsByOrderId.get(oe.order_id) ?? [];
    list.push(label);
    equipmentLabelsByOrderId.set(oe.order_id, list);
  }

  const rows = [
    ["전표번호", "투입현장", "발주업체", "현장 반입일", "현장 반출일(예정)", "티그", "CO2", "상태", "투입장비"],
    ...(ordersRes.data ?? []).map((o) => [
      o.order_number,
      o.site_name,
      o.client_name,
      o.dispatch_date,
      o.return_date ?? "",
      o.tig_count,
      o.co2_count,
      o.status ? (RENTAL_ORDER_STATUS_META[o.status]?.label ?? o.status) : "",
      (equipmentLabelsByOrderId.get(o.id) ?? []).join("; "),
    ]),
  ];

  return csvResponse(`rentals_${todayStamp()}.csv`, toCsv(rows));
}
