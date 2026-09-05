import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EquipmentsExplorer } from "@/components/equipments/equipments-explorer";
import { createClient } from "@/lib/supabase/server";
import { buildEquipmentHistoryList } from "@/lib/equipment-history";
import type { EquipmentRow, LocationRow, MaintenanceLogRow, RentalOrderEquipmentRow, RentalOrderRow } from "@/lib/supabase/types";

export const revalidate = 0;

export default async function EquipmentsPage() {
  const supabase = await createClient();

  const [equipmentsResult, orderEquipmentsResult, ordersResult, maintenanceLogsResult, locationsResult] =
    await Promise.all([
      supabase
        .from("equipments")
        .select("*")
        .eq("is_deleted", false)
        .order("maker")
        .order("capacity_kva")
        .order("serial_no")
        .returns<EquipmentRow[]>(),
      supabase.from("rental_order_equipments").select("*").returns<RentalOrderEquipmentRow[]>(),
      supabase.from("rental_orders").select("*").returns<RentalOrderRow[]>(),
      supabase
        .from("maintenance_logs")
        .select("*")
        .order("service_date", { ascending: false })
        .returns<MaintenanceLogRow[]>(),
      supabase.from("locations").select("*").eq("is_active", true).order("name").returns<LocationRow[]>(),
    ]);

  const fetchError =
    equipmentsResult.error ??
    orderEquipmentsResult.error ??
    ordersResult.error ??
    maintenanceLogsResult.error ??
    locationsResult.error ??
    null;

  if (fetchError) {
    return (
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive">데이터를 불러오지 못했습니다</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>Supabase 연동 상태를 확인해 주세요. (.env.local, RLS 정책, supabase_schema.sql 적용 여부)</p>
          <p className="font-mono text-xs text-destructive">{fetchError.message}</p>
        </CardContent>
      </Card>
    );
  }

  const equipments = equipmentsResult.data ?? [];
  const orderEquipments = orderEquipmentsResult.data ?? [];
  const orders = ordersResult.data ?? [];
  const maintenanceLogs = maintenanceLogsResult.data ?? [];
  const locations = locationsResult.data ?? [];

  const historyByEquipmentId = buildEquipmentHistoryList(orderEquipments, orders);

  const maintenanceByEquipmentId: Record<string, typeof maintenanceLogs> = {};
  for (const log of maintenanceLogs) {
    if (!log.equipment_id) continue;
    (maintenanceByEquipmentId[log.equipment_id] ??= []).push(log);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">발전기 관리</h1>
        <p className="text-sm text-muted-foreground">제조사/용량/번호로 개별 관리하는 발전기</p>
      </div>

      <EquipmentsExplorer
        equipments={equipments}
        historyByEquipmentId={historyByEquipmentId}
        maintenanceByEquipmentId={maintenanceByEquipmentId}
        locations={locations}
      />
    </div>
  );
}
