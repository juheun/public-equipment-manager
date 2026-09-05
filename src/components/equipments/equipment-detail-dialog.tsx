"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { startOfMonth } from "date-fns";
import {
  CalendarClock,
  CheckCircle2,
  Droplet,
  Handshake,
  LogIn,
  Loader2,
  MapPin,
  PackageCheck,
  Pencil,
  Settings2,
  Trash2,
  Truck,
  Wrench,
} from "lucide-react";
import { MiniMonthCalendar, type MiniMonthCalendarBar } from "@/components/shared/mini-month-calendar";
import { TextCombobox } from "@/components/shared/text-combobox";
import { useTeamFilter } from "@/components/shared/team-filter-scope";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { EditEquipmentDialog } from "./edit-equipment-dialog";
import { ReturnOrderDialog, type ReturnOrderSummary } from "@/components/rentals/return-order-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { assignLanes } from "@/lib/calendar-lanes";
import { getKstTodayAsLocalDate, toKstDateString } from "@/lib/date";
import { EQUIPMENT_STATUS_META } from "@/lib/equipment-status";
import { CALENDAR_STATUS_STYLE } from "@/lib/calendar-status-style";
import { formatGeneratorLabel } from "@/lib/generator-label";
import {
  setEquipmentLocation,
  registerOilChange,
  completeEquipmentMaintenance,
  discardEquipment,
  startEquipmentMaintenance,
  returnExternalEquipment,
} from "@/app/actions/equipment";
import type { EquipmentHistoryEntry } from "@/lib/equipment-history";
import type { EquipmentRow, LocationRow, MaintenanceLogRow } from "@/lib/supabase/types";

interface EquipmentDetailDialogProps {
  equipment: EquipmentRow | null;
  history?: EquipmentHistoryEntry[];
  maintenanceLogs?: MaintenanceLogRow[];
  locations: LocationRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRequestRental?: (equipment: EquipmentRow) => void;
}

/** 이력 항목의 캘린더 점유 구간 — 아직 현장 반출 전(returnDate=null)이면 오늘까지 나가 있는 것으로 본다. */
function getHistoryEntryRange(h: EquipmentHistoryEntry, todayStr: string) {
  return { start: h.dispatchDate, end: h.returnDate ?? todayStr };
}

/** 해당 날짜가 걸쳐 있는 대여 구간을 찾는다. */
function findHistoryEntryForDate(dateStr: string, history: EquipmentHistoryEntry[], todayStr: string) {
  return history.find((h) => {
    const { start, end } = getHistoryEntryRange(h, todayStr);
    return dateStr >= start && dateStr <= end;
  });
}

const HISTORY_BAR_STYLE: Record<string, string> = {
  ACTIVE: CALENDAR_STATUS_STYLE.ACTIVE.barClassName,
  COMPLETED: CALENDAR_STATUS_STYLE.RETURNED.barClassName,
};

const ORDER_STATUS_LABEL: Record<string, string> = {
  ACTIVE: "가동중",
  COMPLETED: "반출완료",
};

const ORDER_STATUS_BADGE_CLASS: Record<string, string> = {
  ACTIVE: CALENDAR_STATUS_STYLE.ACTIVE.badgeClassName,
  COMPLETED: CALENDAR_STATUS_STYLE.RETURNED.badgeClassName,
};

export function EquipmentDetailDialog({
  equipment,
  history,
  maintenanceLogs,
  locations,
  open,
  onOpenChange,
  onRequestRental,
}: EquipmentDetailDialogProps) {
  const router = useRouter();

  const [editOpen, setEditOpen] = useState(false);
  const [returnOrder, setReturnOrder] = useState<ReturnOrderSummary | null>(null);

  const [editingLocation, setEditingLocation] = useState(false);
  const [locationInput, setLocationInput] = useState("");
  const [savingLocation, setSavingLocation] = useState(false);

  const [loggingOilChange, setLoggingOilChange] = useState(false);
  const [oilChangeDate, setOilChangeDate] = useState("");
  const [oilChangeHours, setOilChangeHours] = useState("");
  const [oilChangeNotes, setOilChangeNotes] = useState("");
  const [savingOilChange, setSavingOilChange] = useState(false);

  const [startingMaintenance, setStartingMaintenance] = useState(false);
  const [intakeReason, setIntakeReason] = useState("");
  const [savingIntake, setSavingIntake] = useState(false);

  const [completingMaintenance, setCompletingMaintenance] = useState(false);
  const [completeNotes, setCompleteNotes] = useState("");
  const [savingComplete, setSavingComplete] = useState(false);

  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [discarding, setDiscarding] = useState(false);

  const [returnExternalConfirmOpen, setReturnExternalConfirmOpen] = useState(false);
  const [returningExternal, setReturningExternal] = useState(false);

  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(getKstTodayAsLocalDate()));
  const [selectedDateStr, setSelectedDateStr] = useState<string | null>(null);
  const [showOwnTeamOnly, setShowOwnTeamOnly] = useState(false);
  const { ownTeamId, ownTeamName } = useTeamFilter();

  // equipment가 바뀔 때(=새로 열릴 때) 폼을 초기화. useEffect 대신 렌더링 중
  // 상태 조정 패턴을 사용해 불필요한 추가 렌더를 피한다. open도 키에 포함해야
  // 같은 장비를 닫았다가 다시 열 때도 초기화가 재실행된다.
  const openKey = open && equipment ? equipment.id : null;
  const [prevOpenKey, setPrevOpenKey] = useState<string | null>(null);
  if (openKey !== prevOpenKey) {
    setPrevOpenKey(openKey);
    if (openKey && equipment) {
      setEditingLocation(false);
      setLocationInput(equipment.current_location ?? "");
      setLoggingOilChange(false);
      setOilChangeDate(toKstDateString());
      setOilChangeHours(equipment.last_oil_change_hours != null ? String(equipment.last_oil_change_hours) : "");
      setOilChangeNotes("");
      setStartingMaintenance(false);
      setIntakeReason("");
      setCompletingMaintenance(false);
      setCompleteNotes("");
      setDiscardConfirmOpen(false);
      setReturnExternalConfirmOpen(false);
      setCalendarMonth(startOfMonth(getKstTodayAsLocalDate()));
      setShowOwnTeamOnly(false);
      // 출고중(RENTED)이면 "오늘" 날짜를 바로 선택해 현재 진행 중인 대여 건이 클릭
      // 한 번 없이도 바로 보이게 한다.
      setSelectedDateStr(equipment.status === "RENTED" ? toKstDateString() : null);
      setEditOpen(false);
      setReturnOrder(null);
    }
  }

  const todayStr = toKstDateString();

  // "본인 팀 기록만 보기"는 캘린더의 일정 바/일별 상세 목록에만 적용한다 — 현재
  // 가동중인 실제 활성 전표(activeEntry, 반출 처리 버튼 등)는 팀 필터와 무관하게
  // 항상 실제 상태를 반영해야 하므로 별도로 rentalHistory(전체)를 그대로 둔다.
  const calendarHistory = useMemo(() => {
    const list = history ?? [];
    return showOwnTeamOnly ? list.filter((h) => h.teamId === ownTeamId) : list;
  }, [history, showOwnTeamOnly, ownTeamId]);

  // 겹치는 대여 이력이 있으면 캘린더에서 여러 줄로 쌓아 보여준다 — early return 이전
  // (hooks 규칙)에서 계산한다.
  const laneByEntryId = useMemo(() => {
    const items = calendarHistory.map((h) => {
      const { start, end } = getHistoryEntryRange(h, todayStr);
      return { id: h.id, start, end };
    });
    return assignLanes(items);
  }, [calendarHistory, todayStr]);

  if (!equipment) return null;

  const statusMeta = equipment.status ? EQUIPMENT_STATUS_META[equipment.status] : undefined;
  const rentalHistory = history ?? [];
  const maintenance = maintenanceLogs ?? [];
  // 출고중이면 위치는 현장이어야 하고, 대기/점검이면 사내 위치여야 한다 — 현재 상태와
  // 맞지 않는 장소를 실수로 고르지 못하도록 선택지 자체를 필터링한다.
  const isDispatched = equipment.status === "RENTED";
  const locationOptions = locations.filter((l) => l.is_site === isDispatched);
  const internalLocations = locations.filter((l) => !l.is_site);
  const activeEntry = rentalHistory.find((h) => h.orderStatus === "ACTIVE");
  const selectedEntry = selectedDateStr
    ? findHistoryEntryForDate(selectedDateStr, calendarHistory, todayStr)
    : undefined;
  const selectedMaintenance = selectedDateStr
    ? maintenance.filter((m) => m.service_date === selectedDateStr)
    : [];

  async function handleSaveLocation() {
    if (!equipment || locationInput.trim() === "") return;
    setSavingLocation(true);
    const result = await setEquipmentLocation(equipment.id, locationInput.trim());
    setSavingLocation(false);
    if (!result.success) {
      toast.error(result.error ?? "위치 변경에 실패했습니다.");
      return;
    }
    toast.success("보관 위치를 변경했습니다.");
    setEditingLocation(false);
    router.refresh();
  }

  // 대기(AVAILABLE) 장비는 pencil로 편집 모드에 들어가는 절차 없이, 드롭다운에서
  // 고르는 즉시 위치를 반영한다 — 사내 보관 장소 간 빠른 이동 전용.
  async function handleQuickMoveLocation(nextLocation: string) {
    if (!equipment || nextLocation === equipment.current_location) return;
    setSavingLocation(true);
    const result = await setEquipmentLocation(equipment.id, nextLocation);
    setSavingLocation(false);
    if (!result.success) {
      toast.error(result.error ?? "위치 변경에 실패했습니다.");
      return;
    }
    toast.success(`${nextLocation}(으)로 위치를 옮겼습니다.`);
    router.refresh();
  }

  async function handleSaveOilChange() {
    if (!equipment) return;
    if (oilChangeDate.trim() === "") {
      toast.error("교환 일자를 입력해 주세요.");
      return;
    }
    const hours = oilChangeHours.trim() === "" ? null : Number(oilChangeHours);
    if (hours != null && Number.isNaN(hours)) {
      toast.error("아워미터가 올바르지 않습니다.");
      return;
    }

    setSavingOilChange(true);
    const result = await registerOilChange({
      equipmentId: equipment.id,
      serviceDate: oilChangeDate,
      serviceHours: hours,
      notes: oilChangeNotes.trim() || undefined,
    });
    setSavingOilChange(false);
    if (!result.success) {
      toast.error(result.error ?? "오일/필터 교환 등록에 실패했습니다.");
      return;
    }
    toast.success("오일/필터 교환을 등록했습니다.");
    setLoggingOilChange(false);
    router.refresh();
  }

  async function handleStartMaintenance() {
    if (!equipment) return;
    if (intakeReason.trim() === "") {
      toast.error("입고 사유/증상을 입력해 주세요.");
      return;
    }
    setSavingIntake(true);
    const result = await startEquipmentMaintenance(equipment.id, intakeReason.trim());
    setSavingIntake(false);
    if (!result.success) {
      toast.error(result.error ?? "입고 처리에 실패했습니다.");
      return;
    }
    toast.success("점검/수리 입고 처리했습니다.");
    setStartingMaintenance(false);
    setIntakeReason("");
    router.refresh();
  }

  async function handleCompleteMaintenance() {
    if (!equipment) return;
    setSavingComplete(true);
    const result = await completeEquipmentMaintenance(equipment.id, completeNotes.trim() || undefined);
    setSavingComplete(false);
    if (!result.success) {
      toast.error(result.error ?? "점검 완료 처리에 실패했습니다.");
      return;
    }
    toast.success("점검을 완료하고 대기 상태로 전환했습니다.");
    setCompletingMaintenance(false);
    setCompleteNotes("");
    router.refresh();
  }

  async function handleDiscard() {
    if (!equipment) return;
    setDiscarding(true);
    const result = await discardEquipment(equipment.id);
    setDiscarding(false);

    if (!result.success) {
      toast.error(result.error ?? "폐기 처리에 실패했습니다.");
      return;
    }
    toast.success("장비를 폐기 처리했습니다.");
    setDiscardConfirmOpen(false);
    onOpenChange(false);
    router.refresh();
  }

  async function handleReturnExternal() {
    if (!equipment) return;
    setReturningExternal(true);
    const result = await returnExternalEquipment(equipment.id);
    setReturningExternal(false);

    if (!result.success) {
      toast.error(result.error ?? "협력사 반환 처리에 실패했습니다.");
      return;
    }
    toast.success("협력사로 반환 처리했습니다.");
    setReturnExternalConfirmOpen(false);
    onOpenChange(false);
    router.refresh();
  }

  const equipmentLabel = formatGeneratorLabel(equipment);
  const canReturnExternal = equipment.ownership_type === "EXTERNAL" && equipment.status === "AVAILABLE";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 gap-1.5 border-b p-6">
          <DialogTitle>{equipmentLabel}</DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-2">
            <span>발전기</span>
            {statusMeta && (
              <Badge className={cn("hover:bg-inherit", statusMeta.badgeClassName)}>{statusMeta.label}</Badge>
            )}
            {equipment.ownership_type === "EXTERNAL" && (
              <Badge className="border border-orange-500/30 bg-orange-500/15 text-orange-700 hover:bg-orange-500/15 dark:text-orange-300">
                외부 · {equipment.supplier_name ?? "차입"}
              </Badge>
            )}
            <span className="flex items-center gap-1 text-xs">
              <MapPin className="h-3 w-3" />
              {equipment.current_location ?? "위치 미상"}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          {/* 장비 스펙 */}
          <section className="grid grid-cols-2 gap-3 rounded-lg border p-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">상태</p>
              {statusMeta && (
                <Badge className={cn("mt-1 hover:bg-inherit", statusMeta.badgeClassName)}>
                  {statusMeta.label}
                </Badge>
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">현재 위치</p>
              {equipment.status === "AVAILABLE" ? (
                <Select
                  value={equipment.current_location ?? undefined}
                  onValueChange={(v) => v && handleQuickMoveLocation(v)}
                  disabled={savingLocation}
                >
                  <SelectTrigger size="sm" className="mt-1 h-7 w-auto min-w-0 gap-1 text-sm" aria-label="보관 위치 이동">
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
              ) : editingLocation ? (
                <div className="mt-1 flex items-center gap-1.5">
                  <TextCombobox
                    value={locationInput}
                    onChange={setLocationInput}
                    options={locationOptions.map((l) => l.name)}
                    className="h-7 w-auto min-w-0 flex-1 text-sm"
                    newItemLabel={(q) => `신규 ${isDispatched ? "현장" : "위치"}으로 등록: "${q}"`}
                  />
                  <Button size="sm" className="h-7 px-2" disabled={savingLocation} onClick={handleSaveLocation}>
                    {savingLocation ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "저장"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2"
                    onClick={() => setEditingLocation(false)}
                  >
                    취소
                  </Button>
                </div>
              ) : (
                <p className="mt-1 flex items-center gap-1 font-medium">
                  <MapPin className="h-3.5 w-3.5" />
                  {equipment.current_location ?? "위치 미상"}
                  <button
                    type="button"
                    onClick={() => setEditingLocation(true)}
                    className="ml-1 text-muted-foreground hover:text-foreground"
                    aria-label="위치 변경"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                </p>
              )}
            </div>
            {isDispatched && activeEntry && (
              <div>
                <p className="text-xs text-muted-foreground">발주 업체</p>
                <p className="mt-1 font-medium">{activeEntry.clientName}</p>
              </div>
            )}
            {equipment.ownership_type === "EXTERNAL" && (
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground">차입처</p>
                <p className="mt-1 font-medium">{equipment.supplier_name ?? "미상"}</p>
              </div>
            )}
            <div className="col-span-2">
              <p className="text-xs text-muted-foreground">최근 오일/필터 교환</p>
              <p className="mt-1 flex items-center gap-1 font-medium">
                <Droplet className="h-3.5 w-3.5" />
                {equipment.last_oil_change_date
                  ? `${equipment.last_oil_change_date}${
                      equipment.last_oil_change_hours != null ? ` · ${equipment.last_oil_change_hours}h 시점` : ""
                    }`
                  : "이력 없음"}
              </p>
            </div>
          </section>

          {/* 점검 입고 · 오일/필터 교환 등록 */}
          <section>
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-sm font-medium">
                <Wrench className="h-4 w-4" /> 정비 이력
              </h3>
              {!loggingOilChange && !startingMaintenance && !completingMaintenance && (
                <div className="flex items-center gap-2">
                  {(equipment.status === "AVAILABLE" || equipment.status === "RENTED") && (
                    <Button size="sm" variant="outline" onClick={() => setStartingMaintenance(true)}>
                      <LogIn className="h-3.5 w-3.5" /> 점검 입고
                    </Button>
                  )}
                  {equipment.status === "MAINTENANCE" && (
                    <Button size="sm" variant="outline" onClick={() => setCompletingMaintenance(true)}>
                      <CheckCircle2 className="h-3.5 w-3.5" /> 점검 완료
                    </Button>
                  )}
                  <Button size="sm" onClick={() => setLoggingOilChange(true)}>
                    <Droplet className="h-3.5 w-3.5" /> 오일/필터 교환 등록
                  </Button>
                </div>
              )}
            </div>

            {completingMaintenance && (
              <div className="mt-2 space-y-2 rounded-lg border p-3">
                <div>
                  <Label htmlFor="complete-notes" className="text-xs">
                    점검/수리 내용 (선택)
                  </Label>
                  <Textarea
                    id="complete-notes"
                    value={completeNotes}
                    onChange={(e) => setCompleteNotes(e.target.value)}
                    placeholder="예: 유압 호스 교체 후 정상 확인"
                    className="mt-1"
                    rows={2}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setCompletingMaintenance(false)}>
                    취소
                  </Button>
                  <Button size="sm" disabled={savingComplete} onClick={handleCompleteMaintenance}>
                    {savingComplete && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    점검 완료 처리
                  </Button>
                </div>
              </div>
            )}

            {startingMaintenance && (
              <div className="mt-2 space-y-2 rounded-lg border p-3">
                <div>
                  <Label htmlFor="intake-reason" className="text-xs">
                    입고 사유 / 증상
                  </Label>
                  <Textarea
                    id="intake-reason"
                    value={intakeReason}
                    onChange={(e) => setIntakeReason(e.target.value)}
                    placeholder="예: 시동 불량으로 정밀 점검 필요, 유압 누유 발생 등"
                    className="mt-1"
                    rows={2}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setStartingMaintenance(false)}>
                    취소
                  </Button>
                  <Button size="sm" disabled={savingIntake} onClick={handleStartMaintenance}>
                    {savingIntake && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    입고 처리
                  </Button>
                </div>
              </div>
            )}

            {loggingOilChange && (
              <div className="mt-2 space-y-2 rounded-lg border p-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor="oil-change-date" className="text-xs">
                      교환 일자
                    </Label>
                    <Input
                      id="oil-change-date"
                      type="date"
                      value={oilChangeDate}
                      onChange={(e) => setOilChangeDate(e.target.value)}
                      className="mt-1 h-8"
                    />
                  </div>
                  <div>
                    <Label htmlFor="oil-change-hours" className="text-xs">
                      교환 시점 아워미터
                    </Label>
                    <Input
                      id="oil-change-hours"
                      type="number"
                      value={oilChangeHours}
                      onChange={(e) => setOilChangeHours(e.target.value)}
                      className="mt-1 h-8"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="oil-change-notes" className="text-xs">
                    메모
                  </Label>
                  <Textarea
                    id="oil-change-notes"
                    value={oilChangeNotes}
                    onChange={(e) => setOilChangeNotes(e.target.value)}
                    className="mt-1"
                    rows={2}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setLoggingOilChange(false)}>
                    취소
                  </Button>
                  <Button size="sm" disabled={savingOilChange} onClick={handleSaveOilChange}>
                    {savingOilChange && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    저장
                  </Button>
                </div>
              </div>
            )}

            {maintenance.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">정비 이력이 없습니다.</p>
            ) : (
              <ul className="mt-2 max-h-[160px] space-y-1.5 overflow-y-auto rounded-lg border p-2">
                {maintenance.map((log) => (
                  <li key={log.id} className="rounded-md border px-2.5 py-1.5 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            "rounded px-1 py-0.5 text-[10px] font-medium",
                            log.log_type === "START"
                              ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                              : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
                          )}
                        >
                          {log.log_type === "START" ? "입고" : "완료"}
                        </span>
                        {log.service_type}
                      </span>
                      <span className="text-xs text-muted-foreground">{log.service_date}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {log.service_hours != null && `${log.service_hours}h 시점`}
                      {log.service_hours != null && log.notes && " · "}
                      {log.notes}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 대여/정비 이력 캘린더 */}
          <section>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-1.5 text-sm font-medium">
                <CalendarClock className="h-4 w-4" /> 대여 · 정비 이력
              </h3>
              <label className="flex cursor-pointer items-center gap-1.5 text-xs font-normal text-muted-foreground">
                <Checkbox
                  checked={showOwnTeamOnly}
                  onCheckedChange={(v) => setShowOwnTeamOnly(v === true)}
                  aria-label="본인 팀 기록만 보기"
                />
                본인 팀{ownTeamName && `(${ownTeamName})`} 기록만 보기
              </label>
            </div>
            {showOwnTeamOnly && !ownTeamId && (
              <p className="mb-2 text-xs text-muted-foreground">
                소속 팀이 없어 조회할 수 있는 기록이 없습니다.
              </p>
            )}
            <div className="flex flex-col gap-4 sm:flex-row">
              <div className="sm:w-72 sm:shrink-0">
                <MiniMonthCalendar
                  month={calendarMonth}
                  onMonthChange={setCalendarMonth}
                  onDayClick={({ dateStr }) => setSelectedDateStr(dateStr === selectedDateStr ? null : dateStr)}
                  renderDay={({ date, dateStr, isToday }) => {
                    const hasMaintenance = maintenance.some((m) => m.service_date === dateStr);
                    return (
                      <span className="flex w-full items-center justify-between">
                        <span
                          className={cn(
                            "rounded px-0.5 text-xs",
                            isToday && "font-bold text-primary",
                            dateStr === selectedDateStr && "ring-1 ring-foreground",
                          )}
                        >
                          {date.getDate()}
                        </span>
                        {hasMaintenance && (
                          <span className={cn("h-1 w-1 rounded-full", CALENDAR_STATUS_STYLE.MAINTENANCE.dotClassName)} title="정비 이력" />
                        )}
                      </span>
                    );
                  }}
                  renderBars={({ dateStr }) => {
                    const entries = calendarHistory.filter((h) => {
                      const { start, end } = getHistoryEntryRange(h, todayStr);
                      return dateStr >= start && dateStr <= end;
                    });
                    if (entries.length === 0) return [];
                    const maxLane = Math.max(...entries.map((h) => laneByEntryId.get(h.id) ?? 0));
                    // 같은 레인·같은 날짜에 항목이 2개 겹칠 수 있다(당일 현장 반출 후 당일 재반입처럼
                    // 한쪽의 종료일과 다른 쪽의 시작일이 맞닿는 경우) — 덮어쓰지 않고 조각을 쌓는다.
                    const bars: Array<MiniMonthCalendarBar[] | null> = Array(maxLane + 1).fill(null);
                    for (const h of entries) {
                      const { start, end } = getHistoryEntryRange(h, todayStr);
                      const lane = laneByEntryId.get(h.id) ?? 0;
                      const bar: MiniMonthCalendarBar = {
                        className: (h.orderStatus && HISTORY_BAR_STYLE[h.orderStatus]) || "bg-muted-foreground/40",
                        roundLeft: dateStr === start,
                        roundRight: dateStr === end,
                        title: `${h.siteName} (${h.clientName}) (${h.dispatchDate} ~ ${h.returnDate ?? "진행중"})`,
                      };
                      bars[lane] = [...(bars[lane] ?? []), bar];
                    }
                    return bars;
                  }}
                />
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className={cn("inline-block h-1.5 w-3 rounded-full", CALENDAR_STATUS_STYLE.ACTIVE.dotClassName)} />
                    {CALENDAR_STATUS_STYLE.ACTIVE.label}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className={cn("inline-block h-1.5 w-3 rounded-full", CALENDAR_STATUS_STYLE.RETURNED.dotClassName)} />
                    {CALENDAR_STATUS_STYLE.RETURNED.label}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className={cn("inline-block h-1.5 w-1.5 rounded-full", CALENDAR_STATUS_STYLE.MAINTENANCE.dotClassName)} />
                    {CALENDAR_STATUS_STYLE.MAINTENANCE.label}
                  </span>
                </div>
              </div>

              <div className="flex-1 rounded-lg border p-3 text-sm">
                {!selectedDateStr ? (
                  <p className="text-muted-foreground">날짜를 클릭하면 상세 내역이 표시됩니다.</p>
                ) : !selectedEntry && selectedMaintenance.length === 0 ? (
                  <p className="text-muted-foreground">{selectedDateStr}에는 기록이 없습니다.</p>
                ) : (
                  <div className="space-y-3">
                    <p className="font-medium">{selectedDateStr}</p>
                    {selectedEntry && (
                      <div>
                        {/* 상단 행: 현장명 + 거래처명 — 좁은 폭에서도 줄바꿈이 자연스럽도록
                            별도 행으로 분리(버튼과 한 줄에 우겨넣지 않는다). */}
                        <p className="font-semibold break-keep text-slate-900 dark:text-slate-50">
                          {selectedEntry.siteName}
                          <span className="ml-1 text-xs font-normal text-muted-foreground">
                            ({selectedEntry.clientName})
                          </span>
                        </p>
                        {/* 중간 행: 전표번호 + 현장 반입/반출 기간 */}
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {selectedEntry.orderNumber} · {selectedEntry.dispatchDate} ~ {selectedEntry.returnDate ?? "진행중"}
                        </p>
                        {/* 하단 액션 행: 좌측 상태/용접기 뱃지 / 우측 버튼 그룹 */}
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 dark:border-slate-800">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {selectedEntry.orderStatus && (
                              <Badge className={cn("hover:bg-inherit", ORDER_STATUS_BADGE_CLASS[selectedEntry.orderStatus])}>
                                {ORDER_STATUS_LABEL[selectedEntry.orderStatus]}
                              </Badge>
                            )}
                            {selectedEntry.tigCount > 0 && (
                              <Badge className="h-6 gap-1 border border-indigo-500/30 bg-indigo-500/10 px-2 text-xs text-indigo-700 hover:bg-indigo-500/10 dark:text-indigo-300">
                                ⚡ TIG {selectedEntry.tigCount}대
                              </Badge>
                            )}
                            {selectedEntry.co2Count > 0 && (
                              <Badge className="h-6 gap-1 border border-indigo-500/30 bg-indigo-500/10 px-2 text-xs text-indigo-700 hover:bg-indigo-500/10 dark:text-indigo-300">
                                ⚡ CO2 {selectedEntry.co2Count}대
                              </Badge>
                            )}
                          </div>
                          {selectedEntry.orderStatus === "ACTIVE" && (
                            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 shrink-0 px-2 text-xs whitespace-nowrap"
                                onClick={() =>
                                  setReturnOrder({
                                    id: selectedEntry.orderId,
                                    orderNumber: selectedEntry.orderNumber,
                                    clientName: selectedEntry.clientName,
                                    siteName: selectedEntry.siteName,
                                  })
                                }
                              >
                                <PackageCheck className="h-3 w-3" /> 현장 반출 처리
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    {selectedMaintenance.map((m) => (
                      <div key={m.id}>
                        <p>{m.service_type}</p>
                        {m.service_hours != null && (
                          <p className="text-xs text-muted-foreground">{m.service_hours}h 시점</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>

        {/* 하단 액션 바 — 스크롤과 무관하게 항상 노출(Sticky Footer). 150% 확대 시
            버튼이 다 안 들어가면 flex-wrap으로 다음 줄로 내려가고, shrink-0라 바 자체가
            찌그러지진 않는다(줄이 늘면 높이만 자연스럽게 커진다). */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t bg-slate-50 p-4 dark:bg-slate-900">
          <button
            type="button"
            disabled={equipment.status === "RENTED"}
            onClick={() => setDiscardConfirmOpen(true)}
            className="flex items-center gap-1 text-xs whitespace-nowrap text-muted-foreground hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
            title={equipment.status === "RENTED" ? "출고중인 장비는 현장 반출 처리 후 폐기할 수 있습니다." : undefined}
          >
            <Trash2 className="h-3.5 w-3.5" /> 장비 폐기/삭제
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Settings2 className="h-3.5 w-3.5" /> 정보 수정
            </Button>
            {canReturnExternal && (
              <Button
                variant="outline"
                size="sm"
                className="border-amber-500/40 text-amber-700 hover:bg-amber-500/10 dark:text-amber-300"
                onClick={() => setReturnExternalConfirmOpen(true)}
              >
                <Handshake className="h-3.5 w-3.5" /> 협력사 반환
              </Button>
            )}
            {isDispatched && activeEntry && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setReturnOrder({
                    id: activeEntry.orderId,
                    orderNumber: activeEntry.orderNumber,
                    clientName: activeEntry.clientName,
                    siteName: activeEntry.siteName,
                  })
                }
              >
                <PackageCheck className="h-3.5 w-3.5" /> 현장 반출 처리
              </Button>
            )}
            <Button
              size="sm"
              disabled={!onRequestRental}
              onClick={() => {
                if (!equipment || !onRequestRental) return;
                onRequestRental(equipment);
              }}
            >
              <Truck className="h-3.5 w-3.5" /> 대여 등록
            </Button>
          </div>
        </div>
      </DialogContent>

      <EditEquipmentDialog open={editOpen} onOpenChange={setEditOpen} equipment={equipment} locations={locations} />

      <ReturnOrderDialog
        open={returnOrder != null}
        onOpenChange={(open) => {
          if (!open) setReturnOrder(null);
        }}
        order={returnOrder}
      />

      <AlertDialog open={discardConfirmOpen} onOpenChange={setDiscardConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{equipmentLabel} 폐기/매각 처리하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              현황 목록에서 더 이상 보이지 않게 됩니다. 이 작업은 되돌리려면 별도 복구가 필요합니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={discarding} onClick={handleDiscard}>
              {discarding && <Loader2 className="h-4 w-4 animate-spin" />}
              폐기 처리
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={returnExternalConfirmOpen} onOpenChange={setReturnExternalConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{equipmentLabel}을(를) 협력사로 반환 처리하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              해당 발전기를 협력사({equipment.supplier_name ?? "차입처"})로 반환 처리하시겠습니까? 반환 후 활성
              장비 목록에서 제외됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction disabled={returningExternal} onClick={handleReturnExternal}>
              {returningExternal && <Loader2 className="h-4 w-4 animate-spin" />}
              협력사 반환 처리
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
