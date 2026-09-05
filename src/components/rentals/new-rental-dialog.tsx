"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Minus, Plus, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { TextCombobox } from "@/components/shared/text-combobox";
import { createClient } from "@/lib/supabase/client";
import { toKstDateString } from "@/lib/date";
import { CALENDAR_STATUS_STYLE } from "@/lib/calendar-status-style";
import { cn } from "@/lib/utils";
import { registerDispatch } from "@/app/actions/rentals";
import { completeEquipmentMaintenance } from "@/app/actions/equipment";
import type {
  ClientRow,
  EquipmentRow,
  EquipmentStatus,
  LocationRow,
  RentalOrderEquipmentRow,
  RentalOrderRow,
} from "@/lib/supabase/types";

export interface QuickDispatchEquipment {
  id: string;
  maker: string;
  capacityKva: number;
  serialNo: number | null;
  /** 발전기 관리 탭에서 [대여]로 넘어올 때의 상태 — MAINTENANCE면 다이얼로그가 곧바로
   * 배정하지 않고 인라인 점검 완료 확인부터 띄운다. */
  status: EquipmentStatus | null;
}

/** 번호 조회(또는 발전기 관리 탭의 [대여])로 고른 장비가 점검중(MAINTENANCE)일 때
 * 띄우는 인라인 확인 상태 — 정비 완료 처리와 배정을 한 번에 이어서 진행한다. */
interface MaintenancePrompt {
  equipmentId: string;
  serialNo: number | null;
  label: string;
  notes: string;
}

/** 현장 직송으로 배정한 발전기가 물려 있던 이전 ACTIVE 전표에 용접기가 남아있을 때,
 * "얼마나 함께 가져올지"를 현장별로 조정하기 위해 화면에 띄우는 배너 1건. donorTig/
 * donorCo2는 이전 전표에 남아있는 잔여 최대치(스냅샷), swungTig/swungCo2는 사용자가
 * 스텝퍼로 지정한 실제 이관 수량(0 ~ 잔여치)이다. triggerEquipmentId가 배정 목록에서
 * 빠지면(사용자가 해당 발전기를 배정 해제하면) 더 이상 유효하지 않은 배너로 취급해
 * 화면/제출 양쪽에서 숨긴다. */
interface WelderDonor {
  orderId: string;
  siteName: string;
  donorTig: number;
  donorCo2: number;
  swungTig: number;
  swungCo2: number;
  triggerEquipmentId: string;
}

interface NewRentalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialEquipment?: QuickDispatchEquipment | null;
  /** 현장 카드의 [+ 장비 추가 투입]에서 열 때: 업체/현장명을 미리 채워 넣는다. */
  initialClientSite?: { clientName: string; siteName: string } | null;
}

function WelderCounter({
  label,
  value,
  onChange,
  id,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  id: string;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="mt-1 flex items-center gap-1.5">
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          aria-label={`${label} 감소`}
          disabled={value <= 0}
          onClick={() => onChange(Math.max(0, value - 1))}
        >
          <Minus className="h-3.5 w-3.5" />
        </Button>
        <Input
          id={id}
          type="number"
          min={0}
          value={value}
          onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
          className="h-8 w-16 text-center"
        />
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          aria-label={`${label} 증가`}
          onClick={() => onChange(value + 1)}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// 직송 배너 안의 TIG/CO2 개별 스텝퍼 — 0 ~ max(이전 전표의 잔여 수량) 범위에서만
// 움직인다. 우측 [전량 가져오기]는 그 자리에서 바로 max로 세팅하는 퀵버튼.
function WelderDonorStepperRow({
  label,
  value,
  max,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  onChange: (next: number) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-9 shrink-0 text-xs font-medium text-indigo-700 dark:text-indigo-300">{label}</span>
      <Button
        type="button"
        size="icon-xs"
        variant="outline"
        aria-label={`${label} 이관 수량 감소`}
        disabled={value <= 0}
        onClick={() => onChange(value - 1)}
      >
        <Minus className="h-3 w-3" />
      </Button>
      <span className="w-5 text-center text-sm font-medium">{value}</span>
      <Button
        type="button"
        size="icon-xs"
        variant="outline"
        aria-label={`${label} 이관 수량 증가`}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
      >
        <Plus className="h-3 w-3" />
      </Button>
      <span className="text-xs text-muted-foreground">대 (최대 {max}대)</span>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="ml-auto h-6 px-2 text-xs text-indigo-700 dark:text-indigo-300"
        disabled={value >= max}
        onClick={() => onChange(max)}
      >
        전량 가져오기
      </Button>
    </div>
  );
}

export function NewRentalDialog({ open, onOpenChange, initialEquipment, initialClientSite }: NewRentalDialogProps) {
  const router = useRouter();
  const today = toKstDateString();

  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [equipments, setEquipments] = useState<EquipmentRow[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [locations, setLocations] = useState<LocationRow[]>([]);

  const [clientName, setClientName] = useState("");
  const [siteName, setSiteName] = useState("");
  const [dispatchDate, setDispatchDate] = useState(today);
  const [returnDate, setReturnDate] = useState("");
  const [notes, setNotes] = useState("");
  const [serialInput, setSerialInput] = useState("");
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignedIds, setAssignedIds] = useState<string[]>([]);
  const [welderDonors, setWelderDonors] = useState<WelderDonor[]>([]);
  const [tigCount, setTigCount] = useState(0);
  const [co2Count, setCo2Count] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  /** 제출 실패 응답이 "정비중인 장비" 예외를 가리킬 때, 그 장비의 id를 기억해 배정
   * 목록에서 해당 칩을 강조 표시한다 — 다이얼로그를 연 시점엔 배정 가능했더라도 그
   * 사이 다른 사용자가 정비 입고 처리를 했을 수 있으므로, 제출 시점의 서버 판정을
   * 최종 기준으로 삼는다. */
  const [problemEquipmentId, setProblemEquipmentId] = useState<string | null>(null);
  const [maintenancePrompt, setMaintenancePrompt] = useState<MaintenancePrompt | null>(null);
  const [completingMaintenance, setCompletingMaintenance] = useState(false);

  // 다이얼로그가 열릴 때 폼을 초기화한다. Base UI Dialog는 닫혀 있어도 컨텐츠가
  // 마운트된 상태를 유지하므로, effect 안에서 동기적으로 setState하는 대신
  // "prop이 바뀔 때 상태를 조정" 하는 렌더링 중 setState 패턴을 사용한다.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setNotes("");
      setTigCount(0);
      setCo2Count(0);
      setSerialInput("");
      setAssignError(null);
      setFormError(null);
      setProblemEquipmentId(null);
      setCompletingMaintenance(false);
      setWelderDonors([]);
      setDispatchDate(today);
      setReturnDate("");
      if (initialEquipment) {
        setClientName("");
        setSiteName("");
        // 발전기 관리 탭의 [대여]로 넘어온 장비가 점검중이면 곧바로 배정하지 않고
        // 인라인 점검 완료 확인부터 띄운다 — 번호 조회로 고른 경우(handleAssignBySerial)와
        // 동일한 확인 절차를 태운다.
        if (initialEquipment.status === "MAINTENANCE") {
          setAssignedIds([]);
          setMaintenancePrompt({
            equipmentId: initialEquipment.id,
            serialNo: initialEquipment.serialNo,
            label: `${initialEquipment.maker} ${initialEquipment.capacityKva}kVA`,
            notes: "현장 출고 전 점검 완료",
          });
        } else {
          setAssignedIds([initialEquipment.id]);
          setMaintenancePrompt(null);
        }
      } else {
        setClientName(initialClientSite?.clientName ?? "");
        setSiteName(initialClientSite?.siteName ?? "");
        setAssignedIds([]);
        setMaintenancePrompt(null);
      }
      setDataLoading(true);
      setDataError(null);
    }
  }

  useEffect(() => {
    if (!open) return;

    const supabase = createClient();
    let cancelled = false;

    Promise.all([
      supabase
        .from("equipments")
        .select("*")
        .eq("is_deleted", false)
        .order("serial_no")
        .returns<EquipmentRow[]>(),
      supabase
        .from("clients")
        .select("*")
        .eq("is_active", true)
        .order("last_used_at", { ascending: false })
        .returns<ClientRow[]>(),
      supabase.from("locations").select("*").eq("is_active", true).order("name").returns<LocationRow[]>(),
    ])
      .then(([equipmentsRes, clientsRes, locationsRes]) => {
        if (cancelled) return;

        const err = equipmentsRes.error ?? clientsRes.error ?? locationsRes.error ?? null;
        if (err) {
          setDataError(err.message);
          return;
        }

        setEquipments(equipmentsRes.data ?? []);
        setClients(clientsRes.data ?? []);
        setLocations(locationsRes.data ?? []);
      })
      .finally(() => {
        if (!cancelled) setDataLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  // 투입 현장은 항상 외부 현장이어야 하므로 사내 위치는 후보에서 뺀다.
  const siteLocations = useMemo(() => locations.filter((l) => l.is_site), [locations]);

  // 발전기 번호(serial_no)로 역조회해 즉시 배정 목록에 추가한다 — 용량/제조사를
  // 눈으로 훑어 고르는 게 아니라, 현장 담당자가 부르는 번호를 그대로 입력하는
  // 실무 흐름에 맞춘 UI다. 정비중인 장비는 곧바로 막지 않고 "점검 완료 후 배정"
  // 인라인 확인을 띄우며, 이미 다른 현장에 출고(RENTED)된 장비는 "현장 직송"으로
  // 그대로 허용한다(경고 뱃지만 붙는다).
  async function handleAssignBySerial() {
    setAssignError(null);
    const trimmed = serialInput.trim();
    if (!trimmed) return;

    const num = Number(trimmed);
    if (!Number.isInteger(num) || num <= 0) {
      setAssignError("올바른 번호를 입력해 주세요.");
      return;
    }
    const found = equipments.find((eq) => eq.serial_no === num);
    if (!found) {
      setAssignError(`${num}번 발전기를 찾을 수 없습니다.`);
      return;
    }
    if (assignedIds.includes(found.id) || maintenancePrompt?.equipmentId === found.id) {
      setAssignError(`${num}번은 이미 추가되어 있습니다.`);
      return;
    }
    if (found.status === "MAINTENANCE") {
      setMaintenancePrompt({
        equipmentId: found.id,
        serialNo: found.serial_no,
        label: `${found.maker} ${found.capacity_kva}kVA`,
        notes: "현장 출고 전 점검 완료",
      });
      setSerialInput("");
      return;
    }

    setAssignedIds((prev) => [...prev, found.id]);
    setSerialInput("");

    // 현장 직송(이미 RENTED)인 발전기라면, 물려있던 이전 ACTIVE 전표에 용접기가
    // 남아있는지 조회해 "동반 직송" 배너를 띄운다 — 발전기만 옮기고 용접기는 이전
    // 현장에 방치되는 사고를 막기 위함.
    if (found.status === "RENTED") {
      const supabase = createClient();
      const { data: linkRows } = await supabase
        .from("rental_order_equipments")
        .select("order_id")
        .eq("equipment_id", found.id)
        .returns<Pick<RentalOrderEquipmentRow, "order_id">[]>();
      const orderIds = (linkRows ?? []).map((r) => r.order_id).filter((id): id is string => !!id);
      if (orderIds.length === 0) return;

      const { data: activeOrder } = await supabase
        .from("rental_orders")
        .select("id, site_name, tig_count, co2_count")
        .eq("status", "ACTIVE")
        .in("id", orderIds)
        .limit(1)
        .maybeSingle<Pick<RentalOrderRow, "id" | "site_name" | "tig_count" | "co2_count">>();

      if (activeOrder && (activeOrder.tig_count > 0 || activeOrder.co2_count > 0)) {
        setWelderDonors((prev) =>
          prev.some((d) => d.orderId === activeOrder.id)
            ? prev
            : [
                ...prev,
                {
                  orderId: activeOrder.id,
                  siteName: activeOrder.site_name,
                  donorTig: activeOrder.tig_count,
                  donorCo2: activeOrder.co2_count,
                  swungTig: 0,
                  swungCo2: 0,
                  triggerEquipmentId: found.id,
                },
              ],
        );
      }
    }
  }

  // 인라인 점검 완료 확인에서 [정비 완료 및 배정]을 눌렀을 때 — 기존 completeEquipmentMaintenance
  // 서버 액션으로 정비 이력을 남기고 장비를 대기(AVAILABLE) 상태로 되돌린 뒤, 재조회 없이
  // 로컬 목록에 즉시 AVAILABLE로 반영하고 곧바로 배정 목록에 추가한다. 작성 중이던 폼
  // 데이터(현장/거래처/날짜/용접기 수량 등)는 전혀 건드리지 않는다.
  async function handleCompleteMaintenanceAndAssign() {
    if (!maintenancePrompt) return;
    setCompletingMaintenance(true);
    const result = await completeEquipmentMaintenance(maintenancePrompt.equipmentId, maintenancePrompt.notes.trim() || undefined);
    setCompletingMaintenance(false);

    if (!result.success) {
      toast.error(result.error ?? "점검 완료 처리에 실패했습니다.");
      return;
    }

    const { equipmentId, serialNo, label } = maintenancePrompt;
    setEquipments((prev) => prev.map((eq) => (eq.id === equipmentId ? { ...eq, status: "AVAILABLE" } : eq)));
    setAssignedIds((prev) => (prev.includes(equipmentId) ? prev : [...prev, equipmentId]));
    setMaintenancePrompt(null);
    toast.success(`${serialNo != null ? `${serialNo}번 발전기` : label} 점검 완료 및 배정됨`);
    router.refresh();
  }

  function removeAssigned(equipmentId: string) {
    setAssignedIds((prev) => prev.filter((id) => id !== equipmentId));
    setProblemEquipmentId((prev) => (prev === equipmentId ? null : prev));
    // 해당 발전기로 감지됐던 동반 직송 배너도 함께 정리한다 — 스텝퍼로 지정해뒀던
    // 수량이 있었다면 하단 총 수량 카운터에서도 되돌린다.
    setWelderDonors((prev) => {
      const donor = prev.find((d) => d.triggerEquipmentId === equipmentId);
      if (donor) {
        setTigCount((v) => Math.max(0, v - donor.swungTig));
        setCo2Count((v) => Math.max(0, v - donor.swungCo2));
      }
      return prev.filter((d) => d.triggerEquipmentId !== equipmentId);
    });
  }

  // 배너의 TIG/CO2 스텝퍼 값을 바꾸는 즉시 하단 "총 투입 수량" 카운터에도 차액만큼
  // 그대로 반영한다 — 두 값이 항상 연동돼 있어야 사용자가 이중으로 손볼 필요가 없다.
  function updateSwungWelder(orderId: string, field: "swungTig" | "swungCo2", next: number) {
    setWelderDonors((prev) =>
      prev.map((d) => {
        if (d.orderId !== orderId) return d;
        const max = field === "swungTig" ? d.donorTig : d.donorCo2;
        const clamped = Math.max(0, Math.min(max, next));
        const delta = clamped - d[field];
        if (delta !== 0) {
          if (field === "swungTig") setTigCount((v) => Math.max(0, v + delta));
          else setCo2Count((v) => Math.max(0, v + delta));
        }
        return { ...d, [field]: clamped };
      }),
    );
  }

  const assignedEquipments = useMemo(
    () => assignedIds.map((id) => equipments.find((eq) => eq.id === id)).filter((eq): eq is EquipmentRow => !!eq),
    [assignedIds, equipments],
  );

  async function handleSubmit() {
    setFormError(null);

    if (!clientName.trim()) {
      setFormError("발주 업체명을 입력해 주세요.");
      return;
    }
    if (!siteName.trim()) {
      setFormError("투입 현장명을 입력해 주세요.");
      return;
    }
    if (returnDate && returnDate < dispatchDate) {
      setFormError("현장 반출 예정일은 현장 반입일 이후여야 합니다.");
      return;
    }
    if (assignedIds.length === 0 && tigCount <= 0 && co2Count <= 0) {
      setFormError("발전기 또는 용접기를 최소 1개 이상 배정해 주세요.");
      return;
    }

    setSubmitting(true);
    const result = await registerDispatch({
      siteName: siteName.trim(),
      clientName: clientName.trim(),
      equipmentIds: assignedIds,
      tigCount,
      co2Count,
      notes: notes.trim() || undefined,
      dispatchDate,
      returnDate: returnDate || undefined,
      swungWelders: welderDonors
        .filter((d) => assignedIds.includes(d.triggerEquipmentId) && (d.swungTig > 0 || d.swungCo2 > 0))
        .map((d) => ({ orderId: d.orderId, tigCount: d.swungTig, co2Count: d.swungCo2 })),
    });
    setSubmitting(false);

    if (!result.success) {
      const errorMessage = result.error ?? "대여 등록에 실패했습니다.";
      setFormError(errorMessage);

      // 서버가 "정비중인 장비는 배정할 수 없습니다: {라벨}" 형태로 예외를 던지면
      // 라벨 끝의 "N번"을 뽑아 배정 목록에서 해당 칩을 찾아 강조한다 — 다이얼로그를
      // 연 시점엔 배정 가능했더라도 그 사이 다른 사용자가 정비 입고 처리를 했을 수
      // 있다는 뜻이므로, 서버의 최신 판정을 화면에 그대로 반영한다. 번호가 없는
      // 외부 장비 등 라벨을 파싱할 수 없는 경우는 강조 없이 텍스트 안내만 남는다.
      const maintenanceSerialMatch = errorMessage.match(/정비중인 장비는 배정할 수 없습니다:.*?(\d+)번/);
      const maintenanceSerial = maintenanceSerialMatch ? Number(maintenanceSerialMatch[1]) : null;
      const problem =
        maintenanceSerial != null ? equipments.find((eq) => eq.serial_no === maintenanceSerial) : undefined;
      setProblemEquipmentId(problem?.id ?? null);
      return;
    }

    setProblemEquipmentId(null);
    toast.success("대여를 등록했습니다.");
    onOpenChange(false);
    router.refresh();
  }

  const canSubmit = assignedIds.length > 0 || tigCount > 0 || co2Count > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>대여 등록</DialogTitle>
          <DialogDescription>
            발주 업체, 투입 현장, 발전기 번호, 용접기 수량을 입력해 대여를 등록합니다. 등록 즉시 확정됩니다.
          </DialogDescription>
        </DialogHeader>

        {dataLoading ? (
          <div className="flex flex-1 items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : dataError ? (
          <p className="flex-1 py-8 text-center text-sm text-destructive">{dataError}</p>
        ) : (
          <div className="flex-1 space-y-5 overflow-y-auto">
            <section className="space-y-3">
              <div>
                <Label htmlFor="site-name">
                  투입 현장<span className="ml-0.5 text-destructive">*</span>
                </Label>
                <TextCombobox
                  id="site-name"
                  value={siteName}
                  onChange={setSiteName}
                  options={siteLocations.map((l) => l.name)}
                  placeholder="기존 현장 선택 또는 신규 입력"
                  searchPlaceholder="현장명 검색 또는 신규 입력"
                  emptyText="일치하는 현장이 없습니다."
                  newItemLabel={(q) => `신규 현장으로 등록: "${q}"`}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="client-name">
                  발주 업체<span className="ml-0.5 text-destructive">*</span>
                </Label>
                <TextCombobox
                  id="client-name"
                  value={clientName}
                  onChange={setClientName}
                  options={clients.map((c) => c.name)}
                  placeholder="기존 거래처 선택 또는 신규 입력"
                  searchPlaceholder="거래처명 검색 또는 신규 입력"
                  emptyText="일치하는 거래처가 없습니다."
                  newItemLabel={(q) => `신규 거래처로 등록: "${q}"`}
                  className="mt-1"
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="dispatch-date">
                    현장 반입일<span className="ml-0.5 text-destructive">*</span>
                  </Label>
                  <Input
                    id="dispatch-date"
                    type="date"
                    value={dispatchDate}
                    onChange={(e) => setDispatchDate(e.target.value)}
                    className="mt-1"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">현장 투입 일자</p>
                </div>
                <div>
                  <Label htmlFor="return-date">현장 반출 예정일 (선택)</Label>
                  <Input
                    id="return-date"
                    type="date"
                    value={returnDate}
                    onChange={(e) => setReturnDate(e.target.value)}
                    className="mt-1"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">현장 철수 일자</p>
                </div>
              </div>
              <div>
                <Label htmlFor="notes">메모</Label>
                <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1" rows={2} />
              </div>
            </section>

            <section>
              <h3 className="mb-2 text-sm font-medium">발전기 배정</h3>
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  min={1}
                  value={serialInput}
                  onChange={(e) => setSerialInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAssignBySerial();
                    }
                  }}
                  placeholder="발전기 번호 입력 (예: 12, 203)"
                  className="flex-1"
                />
                <Button type="button" variant="outline" onClick={handleAssignBySerial}>
                  <Plus className="h-3.5 w-3.5" /> 배정
                </Button>
              </div>
              {assignError && <p className="mt-1.5 text-xs text-destructive">{assignError}</p>}

              {maintenancePrompt && (
                <div className="mt-2.5 space-y-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 text-sm">
                  <p className="flex items-start gap-1.5 text-amber-800 dark:text-amber-300">
                    <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    ⚠️ {maintenancePrompt.serialNo != null ? `${maintenancePrompt.serialNo}번 ` : ""}발전기(
                    {maintenancePrompt.label})는 현재 점검·수리 중입니다. 정비가 완료되었습니까?
                  </p>
                  <div>
                    <Label htmlFor="maintenance-complete-notes" className="text-xs">
                      점검 내용
                    </Label>
                    <Input
                      id="maintenance-complete-notes"
                      value={maintenancePrompt.notes}
                      onChange={(e) =>
                        setMaintenancePrompt((prev) => (prev ? { ...prev, notes: e.target.value } : prev))
                      }
                      className="mt-1 h-8"
                    />
                  </div>
                  <div className="flex justify-end gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={completingMaintenance}
                      onClick={() => setMaintenancePrompt(null)}
                    >
                      취소
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={completingMaintenance}
                      onClick={handleCompleteMaintenanceAndAssign}
                    >
                      {completingMaintenance && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      정비 완료 및 배정
                    </Button>
                  </div>
                </div>
              )}

              {assignedEquipments.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {assignedEquipments.map((eq) => {
                    const isProblem = eq.id === problemEquipmentId;
                    return (
                      <div
                        key={eq.id}
                        className={cn(
                          "flex items-center gap-1.5 rounded-md border bg-muted/30 py-1 pr-1 pl-2.5 text-sm",
                          isProblem && "border-destructive bg-destructive/10 ring-1 ring-destructive/50",
                        )}
                      >
                        {isProblem && <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-destructive" />}
                        <span className="font-medium whitespace-nowrap">
                          [{eq.serial_no ?? "?"}번 · {eq.maker} {eq.capacity_kva}kVA]
                        </span>
                        {isProblem ? (
                          <Badge className="border border-destructive/30 bg-destructive/15 text-destructive hover:bg-destructive/15">
                            정비중으로 전환됨
                          </Badge>
                        ) : (
                          eq.status === "RENTED" && (
                            <Badge className={CALENDAR_STATUS_STYLE.ACTIVE.badgeClassName}>
                              현재 {eq.current_location ?? "현장"} 가동중 · 직송 대여
                            </Badge>
                          )
                        )}
                        <Button
                          type="button"
                          size="icon-xs"
                          variant="ghost"
                          aria-label={`${eq.serial_no ?? ""}번 배정 해제`}
                          onClick={() => removeAssigned(eq.id)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
              {problemEquipmentId && (
                <p className="mt-1.5 flex items-start gap-1 text-xs text-destructive">
                  <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  방금 다른 사용자가 이 발전기를 정비중으로 전환했습니다. 위 목록에서 [X]로 제거하고 다른
                  발전기로 대체해 주세요.
                </p>
              )}

              {welderDonors
                .filter((d) => assignedIds.includes(d.triggerEquipmentId))
                .map((donor) => (
                  <div
                    key={donor.orderId}
                    className="mt-2.5 space-y-2 rounded-md border border-indigo-500/30 bg-indigo-500/10 p-2.5 text-sm"
                  >
                    <p className="text-xs text-indigo-700 dark:text-indigo-300">
                      💡 이전 현장({donor.siteName})에 물려있는 용접기:{" "}
                      {donor.donorTig > 0 && `TIG ${donor.donorTig}대`}
                      {donor.donorTig > 0 && donor.donorCo2 > 0 && ", "}
                      {donor.donorCo2 > 0 && `CO2 ${donor.donorCo2}대`}
                    </p>
                    {donor.donorTig > 0 && (
                      <WelderDonorStepperRow
                        label="TIG"
                        value={donor.swungTig}
                        max={donor.donorTig}
                        onChange={(next) => updateSwungWelder(donor.orderId, "swungTig", next)}
                      />
                    )}
                    {donor.donorCo2 > 0 && (
                      <WelderDonorStepperRow
                        label="CO2"
                        value={donor.swungCo2}
                        max={donor.donorCo2}
                        onChange={(next) => updateSwungWelder(donor.orderId, "swungCo2", next)}
                      />
                    )}
                  </div>
                ))}
            </section>

            <section className="grid grid-cols-2 gap-3">
              <WelderCounter id="tig-count" label="티그 용접기 수량" value={tigCount} onChange={setTigCount} />
              <WelderCounter id="co2-count" label="CO2 용접기 수량" value={co2Count} onChange={setCo2Count} />
            </section>

            {formError && <p className="text-sm text-destructive">{formError}</p>}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" disabled={submitting} onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button disabled={submitting || dataLoading || !canSubmit} onClick={handleSubmit}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            대여 등록
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
