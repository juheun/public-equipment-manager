"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowDownUp, CircleCheck, Package, Plus, Search, Truck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EquipmentCard } from "./equipment-card";
import { EquipmentDetailDialog } from "./equipment-detail-dialog";
import { NewEquipmentDialog } from "./new-equipment-dialog";
import { NewRentalDialog, type QuickDispatchEquipment } from "@/components/rentals/new-rental-dialog";
import { usePins } from "@/components/shared/pins-provider";
import { formatGeneratorLabel } from "@/lib/generator-label";
import { cn } from "@/lib/utils";
import type { EquipmentRow, LocationRow, MaintenanceLogRow } from "@/lib/supabase/types";
import type { EquipmentHistoryEntry } from "@/lib/equipment-history";

const ALL_TAB = "전체";
const ALL_SUBCATEGORY = "ALL";

// 한 번에 마운트하는 카드 수 — 전체 장비는 그대로 서버에서 한 번에 받아 인메모리
// 필터링/정렬은 즉시 처리하되, DOM에는 이만큼씩만 순차적으로 늘려 붙인다.
const PAGE_SIZE = 24;

type SortOption = "serial-asc" | "serial-desc" | "status" | "capacity-desc" | "capacity-asc";

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "serial-asc", label: "번호 오름차순" },
  { value: "serial-desc", label: "번호 내림차순" },
  { value: "status", label: "상태순 (대기 우선)" },
  { value: "capacity-desc", label: "용량 큰 순" },
  { value: "capacity-asc", label: "용량 작은 순" },
];

// 대기(AVAILABLE) -> 점검중(MAINTENANCE) -> 출고중(RENTED) 순 — 지금 당장 배정
// 가능한 장비가 먼저 보이는 게 실무 흐름에 맞는다.
const STATUS_SORT_ORDER: Record<string, number> = { AVAILABLE: 0, MAINTENANCE: 1, RENTED: 2 };

function compareEquipments(a: EquipmentRow, b: EquipmentRow, sort: SortOption): number {
  switch (sort) {
    case "serial-asc":
    case "serial-desc": {
      // 번호가 없는 외부 차입 장비는 정렬 방향과 무관하게 항상 맨 뒤로 보낸다.
      if (a.serial_no == null && b.serial_no == null) return 0;
      if (a.serial_no == null) return 1;
      if (b.serial_no == null) return -1;
      return sort === "serial-asc" ? a.serial_no - b.serial_no : b.serial_no - a.serial_no;
    }
    case "status":
      return (STATUS_SORT_ORDER[a.status ?? ""] ?? 99) - (STATUS_SORT_ORDER[b.status ?? ""] ?? 99);
    case "capacity-desc":
      return b.capacity_kva - a.capacity_kva;
    case "capacity-asc":
      return a.capacity_kva - b.capacity_kva;
    default:
      return 0;
  }
}

// 검색어를 분석해 "호기 번호 단독 검색(12번, #12)" / "용량 단독 검색(12k, 12kva)" /
// 일반 텍스트(혹은 순수 숫자) 검색으로 구분한다. 앞의 두 경우는 다른 필드를 배제하고
// 정확히 일치하는 장비만 남기고, 나머지는 기존처럼 라벨 부분 일치로 넓게 잡되 아래
// getRelevanceTier로 우선순위를 매긴다.
interface ParsedSearch {
  isSerialOnly: boolean;
  isCapacityOnly: boolean;
  /** "12번"/"#12"/"12k"/"12kva"/순수 숫자 "12"에서 뽑아낸 숫자 — 그 외 텍스트면 null */
  numberValue: number | null;
  /** 소문자로 정규화된 검색어 원문(공백 trim 포함) — 비어 있으면 검색어 없음 */
  text: string;
}

function parseSearchQuery(raw: string): ParsedSearch {
  const text = raw.trim().toLowerCase();
  if (!text) return { isSerialOnly: false, isCapacityOnly: false, numberValue: null, text: "" };

  const serialMatch = text.match(/^#(\d+)$/) ?? text.match(/^(\d+)\s*번$/);
  if (serialMatch) {
    return { isSerialOnly: true, isCapacityOnly: false, numberValue: Number(serialMatch[1]), text };
  }

  const capacityMatch = text.match(/^(\d+)\s*kva$/) ?? text.match(/^(\d+)\s*k$/);
  if (capacityMatch) {
    return { isSerialOnly: false, isCapacityOnly: true, numberValue: Number(capacityMatch[1]), text };
  }

  const plainNumberMatch = text.match(/^(\d+)$/);
  return {
    isSerialOnly: false,
    isCapacityOnly: false,
    numberValue: plainNumberMatch ? Number(plainNumberMatch[1]) : null,
    text,
  };
}

// 일반(비-단독) 검색에서만 쓰는 연관도 우선순위 — 숫자가 없으면 1/3순위는 자동으로
// 걸러진다. 낮을수록 상단에 노출된다.
function getRelevanceTier(eq: EquipmentRow, parsed: ParsedSearch): number {
  if (parsed.numberValue != null && eq.serial_no === parsed.numberValue) return 1;
  const makerStartsWith = eq.maker.toLowerCase().startsWith(parsed.text);
  const tagStartsWith = (eq.external_tag ?? "").toLowerCase().startsWith(parsed.text);
  if (makerStartsWith || tagStartsWith) return 2;
  if (parsed.numberValue != null && eq.capacity_kva === parsed.numberValue) return 3;
  return 4;
}

interface EquipmentsExplorerProps {
  equipments: EquipmentRow[];
  historyByEquipmentId: Record<string, EquipmentHistoryEntry[]>;
  maintenanceByEquipmentId: Record<string, MaintenanceLogRow[]>;
  locations: LocationRow[];
}

export function EquipmentsExplorer({
  equipments,
  historyByEquipmentId,
  maintenanceByEquipmentId,
  locations,
}: EquipmentsExplorerProps) {
  const { pinnedEquipments, togglePin } = usePins();

  const [activeTab, setActiveTab] = useState<string>(ALL_TAB);
  const [activeCapacity, setActiveCapacity] = useState<string>(ALL_SUBCATEGORY);
  const [statusFilter, setStatusFilter] = useState<"ALL" | "AVAILABLE" | "RENTED" | "MAINTENANCE">("ALL");
  const [query, setQuery] = useState("");
  const [sortOption, setSortOption] = useState<SortOption>("serial-asc");
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string | null>(null);
  const [quickDispatchEquipment, setQuickDispatchEquipment] = useState<QuickDispatchEquipment | null>(null);
  const [newEquipmentOpen, setNewEquipmentOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // 발전기는 제조사별로 탭을 나누고, 탭 안에서 용량(kVA)별로 다시 세분화한다.
  const makers = useMemo(() => {
    const set = new Set(equipments.map((eq) => eq.maker));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [equipments]);

  const tabs = useMemo(() => [ALL_TAB, ...makers], [makers]);

  const capacitiesForActiveTab = useMemo(() => {
    if (activeTab === ALL_TAB) return [];
    const set = new Set(equipments.filter((eq) => eq.maker === activeTab).map((eq) => eq.capacity_kva));
    return Array.from(set).sort((a, b) => a - b);
  }, [equipments, activeTab]);

  function handleTabChange(tab: string) {
    setActiveTab(tab);
    setActiveCapacity(ALL_SUBCATEGORY);
  }

  const normalizedQuery = query.trim().toLowerCase();
  const parsedSearch = useMemo(() => parseSearchQuery(query), [query]);

  const filteredEquipments = useMemo(() => {
    const filtered = equipments.filter((eq) => {
      if (activeTab !== ALL_TAB) {
        if (eq.maker !== activeTab) return false;
        if (activeCapacity !== ALL_SUBCATEGORY && String(eq.capacity_kva) !== activeCapacity) return false;
      }
      if (statusFilter !== "ALL" && eq.status !== statusFilter) return false;

      // 호기 번호(12번, #12) / 용량(12k, 12kva)을 명시한 검색은 다른 필드를 배제하고
      // 정확히 일치하는 장비만 남긴다.
      if (parsedSearch.isSerialOnly) return eq.serial_no === parsedSearch.numberValue;
      if (parsedSearch.isCapacityOnly) return eq.capacity_kva === parsedSearch.numberValue;
      if (!parsedSearch.text) return true;
      return formatGeneratorLabel(eq).toLowerCase().includes(parsedSearch.text);
    });

    // 단독 검색(호기/용량 명시)은 이미 동질적인 결과라 연관도 우선순위가 의미 없으므로
    // 선택된 정렬 기준만 적용한다. 그 외 일반 검색어가 있을 때만 연관도 우선순위를
    // 먼저 적용하고, 같은 우선순위 안에서는 선택된 정렬 기준으로 묶는다.
    const useRelevance = parsedSearch.text !== "" && !parsedSearch.isSerialOnly && !parsedSearch.isCapacityOnly;
    return filtered.sort((a, b) => {
      if (useRelevance) {
        const tierDiff = getRelevanceTier(a, parsedSearch) - getRelevanceTier(b, parsedSearch);
        if (tierDiff !== 0) return tierDiff;
      }
      return compareEquipments(a, b, sortOption);
    });
  }, [equipments, activeTab, activeCapacity, statusFilter, parsedSearch, sortOption]);

  // 탭/용량/검색어/정렬 중 무엇이든 바뀌면 무한 스크롤 노출 개수를 다시 첫 페이지로
  // 되돌린다. useEffect로 setState하면 추가 렌더가 한 번 더 발생하므로, 렌더링 중
  // 상태를 조정하는 패턴(다른 다이얼로그들의 "prop이 바뀔 때 상태 조정" 관례와 동일)을 쓴다.
  const filterKey = `${activeTab}|${activeCapacity}|${statusFilter}|${normalizedQuery}|${sortOption}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setVisibleCount(PAGE_SIZE);
  }

  const visibleEquipments = useMemo(
    () => filteredEquipments.slice(0, visibleCount),
    [filteredEquipments, visibleCount],
  );
  const hasMore = visibleCount < filteredEquipments.length;

  // sentinel(바닥 감지용 빈 div)이 뷰포트에 들어오면 다음 페이지만큼 노출 개수를 늘린다.
  // hasMore가 false인 동안은 sentinel 자체를 렌더링하지 않으므로, 다시 true가 될 때만
  // 새로 관찰을 시작한다.
  useEffect(() => {
    if (!hasMore) return;
    const node = sentinelRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((prev) => prev + PAGE_SIZE);
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore]);

  // KPI 카드 클릭 시 토글(같은 카드를 다시 누르면 전체 보기로 해제)한다.
  function toggleStatusFilter(status: "AVAILABLE" | "RENTED" | "MAINTENANCE") {
    setStatusFilter((prev) => (prev === status ? "ALL" : status));
  }

  // 상단 요약 카드는 검색어와 무관하게 "현재 선택된 제조사/용량"만 반영한다.
  const categoryFilteredEquipments = useMemo(() => {
    return equipments.filter((eq) => {
      if (activeTab === ALL_TAB) return true;
      if (eq.maker !== activeTab) return false;
      if (activeCapacity !== ALL_SUBCATEGORY && String(eq.capacity_kva) !== activeCapacity) return false;
      return true;
    });
  }, [equipments, activeTab, activeCapacity]);

  const totalCount = categoryFilteredEquipments.length;
  const availableCount = categoryFilteredEquipments.filter((eq) => eq.status === "AVAILABLE").length;
  const rentedCount = categoryFilteredEquipments.filter((eq) => eq.status === "RENTED").length;
  const maintenanceCount = categoryFilteredEquipments.filter((eq) => eq.status === "MAINTENANCE").length;

  const selectedEquipment = selectedEquipmentId
    ? (equipments.find((eq) => eq.id === selectedEquipmentId) ?? null)
    : null;

  function buildQuickDispatchEquipment(equipment: EquipmentRow): QuickDispatchEquipment {
    return {
      id: equipment.id,
      maker: equipment.maker,
      capacityKva: equipment.capacity_kva,
      serialNo: equipment.serial_no,
      status: equipment.status,
    };
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card
          role="button"
          tabIndex={0}
          onClick={() => setStatusFilter("ALL")}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") setStatusFilter("ALL");
          }}
          className={cn(
            "cursor-pointer transition hover:ring-foreground/20",
            statusFilter === "ALL" && "ring-2 ring-slate-400 dark:ring-slate-500",
          )}
        >
          <CardContent className="flex items-center gap-4 py-4">
            <div className="rounded-full bg-slate-100 p-2.5 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              <Package className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold leading-none">{totalCount}대</p>
              <p className="mt-1 text-sm text-muted-foreground">총 발전기</p>
            </div>
          </CardContent>
        </Card>
        <Card
          role="button"
          tabIndex={0}
          onClick={() => toggleStatusFilter("AVAILABLE")}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") toggleStatusFilter("AVAILABLE");
          }}
          className={cn(
            "cursor-pointer transition hover:ring-foreground/20",
            statusFilter === "AVAILABLE" && "ring-2 ring-emerald-400 dark:ring-emerald-600",
          )}
        >
          <CardContent className="flex items-center gap-4 py-4">
            <div className="rounded-full bg-emerald-100 p-2.5 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              <CircleCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold leading-none">{availableCount}대</p>
              <p className="mt-1 text-sm text-muted-foreground">사내 대기</p>
            </div>
          </CardContent>
        </Card>
        <Card
          role="button"
          tabIndex={0}
          onClick={() => toggleStatusFilter("RENTED")}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") toggleStatusFilter("RENTED");
          }}
          className={cn(
            "cursor-pointer transition hover:ring-foreground/20",
            statusFilter === "RENTED" && "ring-2 ring-blue-400 dark:ring-blue-600",
          )}
        >
          <CardContent className="flex items-center gap-4 py-4">
            <div className="rounded-full bg-blue-100 p-2.5 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
              <Truck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold leading-none">{rentedCount}대</p>
              <p className="mt-1 text-sm text-muted-foreground">현장 출고</p>
            </div>
          </CardContent>
        </Card>
        <Card
          role="button"
          tabIndex={0}
          onClick={() => toggleStatusFilter("MAINTENANCE")}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") toggleStatusFilter("MAINTENANCE");
          }}
          className={cn(
            "cursor-pointer transition hover:ring-foreground/20",
            statusFilter === "MAINTENANCE" && "ring-2 ring-amber-400 dark:ring-amber-600",
          )}
        >
          <CardContent className="flex items-center gap-4 py-4">
            <div className="rounded-full bg-amber-100 p-2.5 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold leading-none">{maintenanceCount}대</p>
              <p className="mt-1 text-sm text-muted-foreground">⚠️ 점검/수리중</p>
            </div>
          </CardContent>
        </Card>
      </div>
      {statusFilter !== "ALL" && (
        <p className="text-xs text-muted-foreground">
          {{ AVAILABLE: "사내 대기", RENTED: "현장 출고", MAINTENANCE: "점검/수리중" }[statusFilter]} 상태만 보는
          중입니다.{" "}
          <button type="button" className="underline underline-offset-2" onClick={() => setStatusFilter("ALL")}>
            전체 보기
          </button>
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="overflow-x-auto">
          <Tabs value={activeTab} onValueChange={(value) => handleTabChange(String(value))}>
            <TabsList className="flex-nowrap">
              {tabs.map((tab) => (
                <TabsTrigger key={tab} value={tab} className="shrink-0">
                  {tab}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
        <div className="flex items-center gap-2">
          <Select value={sortOption} onValueChange={(v) => v && setSortOption(v as SortOption)}>
            <SelectTrigger size="sm" className="w-auto shrink-0 gap-1.5 text-xs" aria-label="정렬 기준">
              <ArrowDownUp className="h-3.5 w-3.5 text-muted-foreground" />
              <SelectValue>
                {(value: string | null) =>
                  SORT_OPTIONS.find((opt) => opt.value === value)?.label ?? "정렬"
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative sm:w-64">
            <Search className="absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="번호, 제조사, 용량 검색"
              className="pr-8 pl-8"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="검색어 지우기"
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <Button size="sm" className="shrink-0" onClick={() => setNewEquipmentOpen(true)}>
            <Plus className="h-4 w-4" /> 새 장비 등록
          </Button>
        </div>
      </div>

      {activeTab !== ALL_TAB && capacitiesForActiveTab.length > 1 && (
        <div className="-mt-2 flex items-center gap-1.5 overflow-x-auto">
          <Button
            size="sm"
            variant={activeCapacity === ALL_SUBCATEGORY ? "secondary" : "ghost"}
            className="h-7 shrink-0 px-2.5 text-xs"
            onClick={() => setActiveCapacity(ALL_SUBCATEGORY)}
          >
            전체
          </Button>
          {capacitiesForActiveTab.map((kva) => (
            <Button
              key={kva}
              size="sm"
              variant={activeCapacity === String(kva) ? "secondary" : "ghost"}
              className="h-7 shrink-0 px-2.5 text-xs"
              onClick={() => setActiveCapacity(String(kva))}
            >
              {kva}kVA
            </Button>
          ))}
        </div>
      )}

      {filteredEquipments.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">해당하는 장비가 없습니다.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visibleEquipments.map((eq) => (
              <EquipmentCard
                key={eq.id}
                equipment={eq}
                isPinned={pinnedEquipments.has(eq.id)}
                onTogglePin={() => togglePin("equipment", eq.id)}
                onOpenDetail={setSelectedEquipmentId}
                onQuickDispatch={(equipment) => setQuickDispatchEquipment(buildQuickDispatchEquipment(equipment))}
                locations={locations}
              />
            ))}
          </div>
          {/* 무한 스크롤 감지 타겟 — 전체를 다 불러왔거나 총 개수가 한 페이지(24개) 미만이면
              hasMore가 false가 되어 아예 렌더링되지 않는다. */}
          {hasMore && <div ref={sentinelRef} aria-hidden className="h-1 w-full" />}
        </>
      )}

      <EquipmentDetailDialog
        equipment={selectedEquipment}
        history={selectedEquipment ? historyByEquipmentId[selectedEquipment.id] : undefined}
        maintenanceLogs={selectedEquipment ? maintenanceByEquipmentId[selectedEquipment.id] : undefined}
        locations={locations}
        open={selectedEquipmentId != null}
        onOpenChange={(open) => {
          if (!open) setSelectedEquipmentId(null);
        }}
        onRequestRental={(equipment) => {
          setSelectedEquipmentId(null);
          setQuickDispatchEquipment(buildQuickDispatchEquipment(equipment));
        }}
      />

      <NewRentalDialog
        open={quickDispatchEquipment != null}
        onOpenChange={(open) => {
          if (!open) setQuickDispatchEquipment(null);
        }}
        initialEquipment={quickDispatchEquipment}
      />

      <NewEquipmentDialog open={newEquipmentOpen} onOpenChange={setNewEquipmentOpen} locations={locations} />
    </div>
  );
}
