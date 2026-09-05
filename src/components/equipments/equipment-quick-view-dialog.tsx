"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EquipmentDetailDialog } from "./equipment-detail-dialog";
import { createClient } from "@/lib/supabase/client";
import { buildEquipmentHistoryList, type EquipmentHistoryEntry } from "@/lib/equipment-history";
import type {
  EquipmentRow,
  LocationRow,
  MaintenanceLogRow,
  RentalOrderEquipmentRow,
  RentalOrderRow,
} from "@/lib/supabase/types";

interface EquipmentQuickViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  equipmentId: string | null;
}

// 대시보드(진행중인 대여/긴급 점검 리스트)에서 장비를 클릭했을 때 장비 상세 모달을
// 즉시 띄우기 위한 래퍼. /equipments 페이지는 이미 로드해 둔 전체 데이터를
// EquipmentDetailDialog에 그대로 넘기지만, 대시보드는 그 데이터를 갖고 있지 않으므로
// 이 컴포넌트가 열릴 때 필요한 만큼만 client-side로 조회해 같은 모달을 재사용한다.
export function EquipmentQuickViewDialog({ open, onOpenChange, equipmentId }: EquipmentQuickViewDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [equipment, setEquipment] = useState<EquipmentRow | null>(null);
  const [history, setHistory] = useState<EquipmentHistoryEntry[]>([]);
  const [maintenanceLogs, setMaintenanceLogs] = useState<MaintenanceLogRow[]>([]);
  const [locations, setLocations] = useState<LocationRow[]>([]);

  const openKey = open && equipmentId ? equipmentId : null;
  const [prevOpenKey, setPrevOpenKey] = useState<string | null>(null);
  if (openKey !== prevOpenKey) {
    setPrevOpenKey(openKey);
    if (openKey) {
      setLoading(true);
      setError(null);
      setEquipment(null);
    }
  }

  useEffect(() => {
    if (!open || !equipmentId) return;

    const supabase = createClient();
    let cancelled = false;

    Promise.all([
      supabase.from("equipments").select("*").eq("id", equipmentId).returns<EquipmentRow[]>(),
      supabase.from("rental_order_equipments").select("*").eq("equipment_id", equipmentId).returns<RentalOrderEquipmentRow[]>(),
      supabase
        .from("maintenance_logs")
        .select("*")
        .eq("equipment_id", equipmentId)
        .order("service_date", { ascending: false })
        .returns<MaintenanceLogRow[]>(),
      supabase.from("locations").select("*").eq("is_active", true).returns<LocationRow[]>(),
    ])
      .then(async ([equipmentRes, orderEquipmentsRes, maintenanceLogsRes, locationsRes]) => {
        if (cancelled) return;

        const err = equipmentRes.error ?? orderEquipmentsRes.error ?? maintenanceLogsRes.error ?? locationsRes.error ?? null;
        if (err) {
          setError(err.message);
          return;
        }

        const eq = equipmentRes.data?.[0] ?? null;
        if (!eq) {
          setError("장비 정보를 찾을 수 없습니다.");
          return;
        }

        const orderIds = Array.from(
          new Set((orderEquipmentsRes.data ?? []).map((oe) => oe.order_id).filter((id): id is string => !!id)),
        );
        let orders: RentalOrderRow[] = [];
        if (orderIds.length > 0) {
          const ordersRes = await supabase.from("rental_orders").select("*").in("id", orderIds).returns<RentalOrderRow[]>();
          if (cancelled) return;
          if (ordersRes.error) {
            setError(ordersRes.error.message);
            return;
          }
          orders = ordersRes.data ?? [];
        }

        const historyByEquipmentId = buildEquipmentHistoryList(orderEquipmentsRes.data ?? [], orders);

        setEquipment(eq);
        setHistory(historyByEquipmentId[equipmentId] ?? []);
        setMaintenanceLogs(maintenanceLogsRes.data ?? []);
        setLocations(locationsRes.data ?? []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, equipmentId]);

  if (loading || error || !equipment) {
    if (!open) return null;
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-destructive">{error ?? "장비 정보를 찾을 수 없습니다."}</p>
          )}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <EquipmentDetailDialog
      equipment={equipment}
      history={history}
      maintenanceLogs={maintenanceLogs}
      locations={locations}
      open={open}
      onOpenChange={onOpenChange}
    />
  );
}
