import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SettingsExplorer } from "@/components/settings/settings-explorer";
import { createClient } from "@/lib/supabase/server";
import type {
  ActivityLogRow,
  ClientContactRow,
  ClientRow,
  EquipmentRow,
  LocationRow,
  RentalOrderEquipmentRow,
} from "@/lib/supabase/types";

export const revalidate = 0;

export default async function SettingsPage() {
  const supabase = await createClient();

  const [
    clientsResult,
    clientContactsResult,
    locationsResult,
    discardedEquipmentResult,
    orderEquipmentsResult,
    activityLogsResult,
  ] = await Promise.all([
    supabase.from("clients").select("*").order("name").returns<ClientRow[]>(),
    supabase.from("client_contacts").select("*").returns<ClientContactRow[]>(),
    supabase.from("locations").select("*").order("name").returns<LocationRow[]>(),
    supabase.from("equipments").select("*").eq("is_deleted", true).order("maker").returns<EquipmentRow[]>(),
    // 삭제된 발전기 각각의 대여 이력 유무 판단용 (완전 삭제 버튼 노출 조건)
    supabase.from("rental_order_equipments").select("equipment_id").returns<Pick<RentalOrderEquipmentRow, "equipment_id">[]>(),
    supabase
      .from("activity_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500)
      .returns<ActivityLogRow[]>(),
  ]);

  const fetchError =
    clientsResult.error ??
    clientContactsResult.error ??
    locationsResult.error ??
    discardedEquipmentResult.error ??
    orderEquipmentsResult.error ??
    activityLogsResult.error ??
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

  const equipmentIdsWithHistory = new Set(
    (orderEquipmentsResult.data ?? []).map((row) => row.equipment_id).filter((id): id is string => id !== null),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">설정</h1>
        <p className="text-sm text-muted-foreground">기준 정보(거래처/현장) 관리와 작업 로그</p>
      </div>

      <SettingsExplorer
        clients={clientsResult.data ?? []}
        clientContacts={clientContactsResult.data ?? []}
        locations={locationsResult.data ?? []}
        discardedEquipment={discardedEquipmentResult.data ?? []}
        equipmentIdsWithHistory={equipmentIdsWithHistory}
        activityLogs={activityLogsResult.data ?? []}
      />
    </div>
  );
}
