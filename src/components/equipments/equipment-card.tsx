"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Gauge, MapPin } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { EQUIPMENT_STATUS_META } from "@/lib/equipment-status";
import { PinButton } from "@/components/shared/pin-button";
import { setEquipmentLocation } from "@/app/actions/equipment";
import type { EquipmentRow, LocationRow } from "@/lib/supabase/types";

interface EquipmentCardProps {
  equipment: EquipmentRow;
  isPinned: boolean;
  onTogglePin: () => void;
  onOpenDetail: (id: string) => void;
  onQuickDispatch: (equipment: EquipmentRow) => void;
  locations: LocationRow[];
}

export function EquipmentCard({
  equipment,
  isPinned,
  onTogglePin,
  onOpenDetail,
  onQuickDispatch,
  locations,
}: EquipmentCardProps) {
  const router = useRouter();
  const [movingLocation, setMovingLocation] = useState(false);
  const [maintenanceConfirmOpen, setMaintenanceConfirmOpen] = useState(false);
  const statusMeta = equipment.status ? EQUIPMENT_STATUS_META[equipment.status] : undefined;

  const locationLabel =
    equipment.status === "RENTED"
      ? `${equipment.current_location ?? "현장 미상"} (가동중)`
      : (equipment.current_location ?? "위치 미상");

  // 대기(AVAILABLE) 장비만 사내 보관 위치 간 즉시 이동을 지원한다 — 가동중/점검중 장비는
  // 대여·반출 절차나 상세 모달의 위치 편집으로만 옮긴다.
  const internalLocations = locations.filter((l) => !l.is_site);

  async function handleQuickMove(nextLocation: string) {
    if (nextLocation === equipment.current_location) return;
    setMovingLocation(true);
    const result = await setEquipmentLocation(equipment.id, nextLocation);
    setMovingLocation(false);
    if (!result.success) {
      toast.error(result.error ?? "위치 변경에 실패했습니다.");
      return;
    }
    toast.success(`${nextLocation}(으)로 위치를 옮겼습니다.`);
    router.refresh();
  }

  return (
    <Card className="gap-3 py-4">
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="leading-tight break-keep">
              {equipment.serial_no != null ? (
                <>
                  <span className="text-lg font-bold">{equipment.serial_no}번</span>
                  <span className="ml-1.5 text-sm text-muted-foreground">
                    · {equipment.maker} {equipment.capacity_kva}kVA
                  </span>
                </>
              ) : (
                <>
                  <span className="text-lg font-bold">
                    {equipment.maker} {equipment.capacity_kva}kVA
                  </span>
                  <span className="ml-1.5 text-sm text-muted-foreground">
                    ({[equipment.supplier_name, equipment.external_tag].filter(Boolean).join(" ") || "번호 미부여"})
                  </span>
                </>
              )}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
            {equipment.ownership_type === "EXTERNAL" && (
              <Badge className="border border-orange-500/30 bg-orange-500/15 text-orange-700 hover:bg-orange-500/15 dark:text-orange-300">
                외부 · {equipment.supplier_name ?? "차입"}
              </Badge>
            )}
            {statusMeta && (
              <Badge className={cn("hover:bg-inherit", statusMeta.badgeClassName)}>{statusMeta.label}</Badge>
            )}
            <PinButton pinned={isPinned} onToggle={onTogglePin} />
          </div>
        </div>

        <div className="space-y-1 text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            {equipment.status === "AVAILABLE" ? (
              <Select
                value={equipment.current_location ?? undefined}
                onValueChange={(v) => v && handleQuickMove(v)}
                disabled={movingLocation}
              >
                <SelectTrigger
                  size="sm"
                  className="h-6 w-auto min-w-0 gap-1 border-none bg-transparent px-0 text-sm text-muted-foreground shadow-none hover:bg-transparent focus-visible:ring-0"
                  aria-label="보관 위치 이동"
                >
                  <SelectValue placeholder="위치 미상" />
                </SelectTrigger>
                <SelectContent>
                  {internalLocations.map((l) => (
                    <SelectItem key={l.id} value={l.name}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              locationLabel
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <Gauge className="h-3.5 w-3.5" />
            {equipment.last_oil_change_date
              ? `최근 교환: ${equipment.last_oil_change_date}${
                  equipment.last_oil_change_hours != null ? ` (${equipment.last_oil_change_hours}h)` : ""
                }`
              : "최근 교환: 이력 없음"}
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <Button size="sm" variant="outline" className="flex-1" onClick={() => onOpenDetail(equipment.id)}>
            상세
          </Button>
          <Button
            size="sm"
            className="flex-1"
            onClick={() => {
              if (equipment.status === "MAINTENANCE") {
                setMaintenanceConfirmOpen(true);
              } else {
                onQuickDispatch(equipment);
              }
            }}
          >
            대여
          </Button>
        </div>

        <AlertDialog open={maintenanceConfirmOpen} onOpenChange={setMaintenanceConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>점검 중인 장비입니다</AlertDialogTitle>
              <AlertDialogDescription>
                {equipment.serial_no != null ? `${equipment.serial_no}번 ` : ""}
                {equipment.maker} {equipment.capacity_kva}kVA 발전기는 현재 점검·수리 중입니다. 점검을 완료하고
                대여를 진행하시겠습니까?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>취소</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setMaintenanceConfirmOpen(false);
                  onQuickDispatch(equipment);
                }}
              >
                점검 완료하고 진행
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
