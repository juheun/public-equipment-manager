"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";
import { ChevronDown, Loader2, PackageCheck, Plus, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { NewRentalDialog } from "@/components/rentals/new-rental-dialog";
import { ReturnOrderDialog, type ReturnOrderSummary } from "@/components/rentals/return-order-dialog";
import { EquipmentQuickViewDialog } from "@/components/equipments/equipment-quick-view-dialog";
import { PinButton } from "@/components/shared/pin-button";
import { PinnedEmptyState } from "@/components/shared/pinned-empty-state";
import { useDashboardFilterMode } from "./dashboard-filter-scope";
import { usePins } from "@/components/shared/pins-provider";
import { ALL_TEAMS, useTeamFilter } from "@/components/shared/team-filter-scope";
import { cancelDispatch } from "@/app/actions/rentals";
import { createClient } from "@/lib/supabase/client";
import { diffCalendarDays } from "@/lib/date";
import { CALENDAR_STATUS_STYLE } from "@/lib/calendar-status-style";
import { cn } from "@/lib/utils";
import type { EquipmentRow, RentalOrderEquipmentRow, RentalOrderRow, TeamRow } from "@/lib/supabase/types";
import { formatGeneratorLabel } from "@/lib/generator-label";

// 발전기 뱃지와 나란히 붙이는 용접기(TIG/CO2) 전용 배지 — 발전기 뱃지(회색 muted 톤)와
// 헷갈리지 않도록 인디고 톤 아웃라인으로 구분한다.
export function WelderBadges({ tigCount, co2Count }: { tigCount: number; co2Count: number }) {
  if (tigCount <= 0 && co2Count <= 0) return null;
  return (
    <>
      {tigCount > 0 && (
        <Badge className="h-6 gap-1 border border-indigo-500/30 bg-indigo-500/10 px-2 text-xs text-indigo-700 hover:bg-indigo-500/10 dark:text-indigo-300">
          ⚡ TIG {tigCount}대
        </Badge>
      )}
      {co2Count > 0 && (
        <Badge className="h-6 gap-1 border border-indigo-500/30 bg-indigo-500/10 px-2 text-xs text-indigo-700 hover:bg-indigo-500/10 dark:text-indigo-300">
          ⚡ CO2 {co2Count}대
        </Badge>
      )}
    </>
  );
}

export interface OrderEquipmentItem {
  equipmentId: string;
  name: string;
  /** 외부 차입(전대) 장비면 차입처 상호, 자사 보유면 null */
  externalSupplierName: string | null;
}

export interface OrderSummary {
  id: string;
  orderNumber: string;
  clientName: string;
  siteName: string;
  teamId: string | null;
  teamName: string | null;
  dispatchDate: string;
  returnDate: string | null;
  tigCount: number;
  co2Count: number;
  equipmentItems: OrderEquipmentItem[];
}

interface ClientOrderGroup {
  clientName: string;
  orders: OrderSummary[];
}

interface SiteGroup {
  siteName: string;
  clients: ClientOrderGroup[];
}

interface RentalOrdersPanelProps {
  activeOrders: OrderSummary[];
  /** KST 기준 오늘 날짜, YYYY-MM-DD */
  todayStr: string;
}

// 총 가동일수 — 아직 현장 반출 전이면 오늘까지, 반출됐으면 실제 반출일까지.
function totalDaysLabel(o: Pick<OrderSummary, "dispatchDate" | "returnDate">, todayStr: string): string {
  const endForCalc = o.returnDate ?? todayStr;
  const days = diffCalendarDays(endForCalc, o.dispatchDate) + 1;
  return `총 ${Math.max(days, 1)}일`;
}

// 진행중인 대여의 가동 경과일 — 반입 당일을 1일째로 센다.
function ongoingDaysLabel(dispatchDate: string, todayStr: string): string {
  const days = diffCalendarDays(todayStr, dispatchDate) + 1;
  return `${Math.max(days, 1)}일째 가동중`;
}

function compareOrders(a: OrderSummary, b: OrderSummary) {
  return a.dispatchDate.localeCompare(b.dispatchDate);
}

export function RentalOrdersPanel({ activeOrders, todayStr }: RentalOrdersPanelProps) {
  const router = useRouter();
  const [rentalDialogOpen, setRentalDialogOpen] = useState(false);
  const [rentalPrefill, setRentalPrefill] = useState<{ clientName: string; siteName: string } | null>(null);
  const [returnOrder, setReturnOrder] = useState<ReturnOrderSummary | null>(null);
  const [collapsedSites, setCollapsedSites] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [quickViewEquipmentId, setQuickViewEquipmentId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"ACTIVE" | "COMPLETED">("ACTIVE");
  const [completedYearMonth, setCompletedYearMonth] = useState(() => todayStr.slice(0, 7));
  const [completedOrders, setCompletedOrders] = useState<OrderSummary[]>([]);
  const [completedLoading, setCompletedLoading] = useState(false);
  const [completedError, setCompletedError] = useState<string | null>(null);
  const [completedSearchActive, setCompletedSearchActive] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<{ id: string; orderNumber: string } | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const { pinnedSites, togglePin } = usePins();
  const mode = useDashboardFilterMode();
  const { selectedTeamId } = useTeamFilter();

  const normalizedQuery = query.trim().toLowerCase();

  const [debouncedCompletedSearch, setDebouncedCompletedSearch] = useState("");
  useEffect(() => {
    if (statusFilter !== "COMPLETED") return;
    const q = normalizedQuery.length >= 2 ? normalizedQuery : "";
    const timer = setTimeout(() => setDebouncedCompletedSearch(q), 300);
    return () => clearTimeout(timer);
  }, [normalizedQuery, statusFilter]);

  const completedFetchKey = `${statusFilter}:${completedYearMonth}:${debouncedCompletedSearch}`;
  const [prevCompletedFetchKey, setPrevCompletedFetchKey] = useState(completedFetchKey);
  if (completedFetchKey !== prevCompletedFetchKey) {
    setPrevCompletedFetchKey(completedFetchKey);
    if (statusFilter === "COMPLETED") {
      setCompletedLoading(true);
      setCompletedError(null);
    }
  }

  useEffect(() => {
    if (statusFilter !== "COMPLETED") return;

    const supabase = createClient();
    let cancelled = false;
    const searching = debouncedCompletedSearch.length >= 2;

    (async () => {
      let ordersQuery = supabase.from("rental_orders").select("*").eq("status", "COMPLETED");

      if (searching) {
        const q = debouncedCompletedSearch.replace(/[%,]/g, "");
        ordersQuery = ordersQuery.or(
          `site_name.ilike.%${q}%,client_name.ilike.%${q}%,order_number.ilike.%${q}%`,
        );
      } else {
        const [y, m] = completedYearMonth.split("-").map(Number);
        const monthStartStr = `${completedYearMonth}-01`;
        const monthEndStr = format(new Date(y, m, 0), "yyyy-MM-dd");
        ordersQuery = ordersQuery.gte("return_date", monthStartStr).lte("return_date", monthEndStr);
      }

      const ordersRes = await ordersQuery
        .order("return_date", { ascending: false })
        .limit(50)
        .returns<RentalOrderRow[]>();
      if (cancelled) return;
      if (ordersRes.error) {
        setCompletedError(ordersRes.error.message);
        setCompletedLoading(false);
        return;
      }

      const orders = ordersRes.data ?? [];
      setCompletedSearchActive(searching);
      const orderIds = orders.map((o) => o.id);
      if (orderIds.length === 0) {
        setCompletedOrders([]);
        setCompletedLoading(false);
        return;
      }

      const [orderEqRes, equipmentsRes, teamsRes] = await Promise.all([
        supabase.from("rental_order_equipments").select("*").in("order_id", orderIds).returns<RentalOrderEquipmentRow[]>(),
        supabase.from("equipments").select("*").returns<EquipmentRow[]>(),
        supabase.from("teams").select("*").returns<TeamRow[]>(),
      ]);
      if (cancelled) return;

      const err = orderEqRes.error ?? equipmentsRes.error ?? teamsRes.error ?? null;
      if (err) {
        setCompletedError(err.message);
        setCompletedLoading(false);
        return;
      }

      const equipmentById = new Map((equipmentsRes.data ?? []).map((e) => [e.id, e]));
      const teamNameById = new Map((teamsRes.data ?? []).map((t) => [t.id, t.name]));

      const equipmentItemsByOrderId = new Map<string, OrderEquipmentItem[]>();
      for (const oe of orderEqRes.data ?? []) {
        if (!oe.order_id || !oe.equipment_id) continue;
        const eq = equipmentById.get(oe.equipment_id);
        if (!eq) continue;
        const list = equipmentItemsByOrderId.get(oe.order_id) ?? [];
        list.push({
          equipmentId: eq.id,
          name: formatGeneratorLabel(eq),
          externalSupplierName: eq.ownership_type === "EXTERNAL" ? (eq.supplier_name ?? "차입") : null,
        });
        equipmentItemsByOrderId.set(oe.order_id, list);
      }

      setCompletedOrders(
        orders.map((o) => ({
          id: o.id,
          orderNumber: o.order_number,
          clientName: o.client_name,
          siteName: o.site_name,
          teamId: o.team_id,
          teamName: o.team_id ? (teamNameById.get(o.team_id) ?? null) : null,
          dispatchDate: o.dispatch_date,
          returnDate: o.return_date,
          tigCount: o.tig_count,
          co2Count: o.co2_count,
          equipmentItems: equipmentItemsByOrderId.get(o.id) ?? [],
        })),
      );
      setCompletedLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [statusFilter, completedYearMonth, debouncedCompletedSearch]);

  const completedFilteredOrders = useMemo(() => {
    const teamScoped =
      selectedTeamId === ALL_TEAMS ? completedOrders : completedOrders.filter((o) => o.teamId === selectedTeamId);
    if (!normalizedQuery) return teamScoped;
    return teamScoped.filter(
      (o) =>
        o.siteName.toLowerCase().includes(normalizedQuery) ||
        o.clientName.toLowerCase().includes(normalizedQuery) ||
        o.orderNumber.toLowerCase().includes(normalizedQuery) ||
        o.equipmentItems.some((item) => item.name.toLowerCase().includes(normalizedQuery)),
    );
  }, [completedOrders, normalizedQuery, selectedTeamId]);

  const completedMonthOptions = useMemo(() => {
    const [y, m] = todayStr.slice(0, 7).split("-").map(Number);
    return Array.from({ length: 24 }, (_, i) => {
      const d = new Date(y, m - 1 - i, 1);
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      return { value, label: `${d.getFullYear()}년 ${d.getMonth() + 1}월` };
    });
  }, [todayStr]);

  async function handleCancelDispatch() {
    if (!cancelTarget) return;
    setCancelling(true);
    const result = await cancelDispatch(cancelTarget.id);
    setCancelling(false);

    if (!result.success) {
      toast.error(result.error ?? "대여 취소에 실패했습니다.");
      return;
    }
    toast.success(`${cancelTarget.orderNumber} 대여를 취소하고 발전기를 사내로 원복했습니다.`);
    setCancelTarget(null);
    router.refresh();
  }

  function openNewRental(prefill: { clientName: string; siteName: string } | null) {
    setRentalPrefill(prefill);
    setRentalDialogOpen(true);
  }

  function toggleSiteExpanded(siteName: string) {
    setCollapsedSites((prev) => {
      const next = new Set(prev);
      if (next.has(siteName)) next.delete(siteName);
      else next.add(siteName);
      return next;
    });
  }

  const pinScopedOrders = useMemo(() => {
    const byPinned = mode !== "pinned" ? activeOrders : activeOrders.filter((o) => pinnedSites.has(o.siteName));
    if (selectedTeamId === ALL_TEAMS) return byPinned;
    return byPinned.filter((o) => o.teamId === selectedTeamId);
  }, [activeOrders, mode, pinnedSites, selectedTeamId]);

  const siteGroups = useMemo<SiteGroup[]>(() => {
    const bySite = new Map<string, Map<string, OrderSummary[]>>();
    for (const order of pinScopedOrders) {
      let clientsMap = bySite.get(order.siteName);
      if (!clientsMap) {
        clientsMap = new Map();
        bySite.set(order.siteName, clientsMap);
      }
      const list = clientsMap.get(order.clientName) ?? [];
      list.push(order);
      clientsMap.set(order.clientName, list);
    }
    return Array.from(bySite.entries()).map(([siteName, clientsMap]) => ({
      siteName,
      clients: Array.from(clientsMap.entries())
        .map(([clientName, orders]) => ({ clientName, orders: [...orders].sort(compareOrders) }))
        .sort((a, b) => a.clientName.localeCompare(b.clientName)),
    }));
  }, [pinScopedOrders]);

  const visibleGroups = useMemo(() => {
    return [...siteGroups].sort((a, b) => {
      const aPinned = pinnedSites.has(a.siteName) ? 1 : 0;
      const bPinned = pinnedSites.has(b.siteName) ? 1 : 0;
      return bPinned - aPinned;
    });
  }, [siteGroups, pinnedSites]);

  const searchedGroups = useMemo(() => {
    if (!normalizedQuery) return visibleGroups;
    const result: SiteGroup[] = [];
    for (const group of visibleGroups) {
      const siteMatches = group.siteName.toLowerCase().includes(normalizedQuery);
      const clients = siteMatches
        ? group.clients
        : group.clients.filter((c) => {
            if (c.clientName.toLowerCase().includes(normalizedQuery)) return true;
            return c.orders.some((o) => o.equipmentItems.some((item) => item.name.toLowerCase().includes(normalizedQuery)));
          });
      if (clients.length > 0) result.push({ siteName: group.siteName, clients });
    }
    return result;
  }, [visibleGroups, normalizedQuery]);

  const isEmpty = searchedGroups.length === 0;
  const emptyMessage = normalizedQuery ? "검색 결과가 없습니다." : "현재 출고중인 대여 건이 없습니다.";

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">대여 현황</CardTitle>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium whitespace-nowrap text-muted-foreground">
            가동중 {pinScopedOrders.length}건
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <Button
            size="sm"
            variant={statusFilter === "ACTIVE" ? "default" : "outline"}
            className="h-7 px-2 text-xs whitespace-nowrap"
            onClick={() => setStatusFilter("ACTIVE")}
          >
            🚚 가동중 ({pinScopedOrders.length})
          </Button>
          <Button
            size="sm"
            variant={statusFilter === "COMPLETED" ? "default" : "outline"}
            className="h-7 px-2 text-xs whitespace-nowrap"
            onClick={() => setStatusFilter("COMPLETED")}
          >
            ✅ 완료/정산
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="현장명/거래처 검색..."
            className="h-8 w-40 text-xs sm:w-56"
          />
          <Button size="sm" onClick={() => openNewRental(null)}>
            <Plus className="h-4 w-4" /> 새 대여 등록
          </Button>
        </div>
      </CardHeader>
      <CardContent className="scrollbar-thin max-h-[480px] space-y-3 overflow-y-auto pr-1.5">
        {statusFilter === "COMPLETED" ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Select
                value={completedYearMonth}
                onValueChange={(v) => v && setCompletedYearMonth(v)}
                disabled={completedSearchActive}
              >
                <SelectTrigger size="sm" className="w-36 bg-background">
                  <SelectValue>
                    {(value: string | null) => completedMonthOptions.find((o) => o.value === value)?.label ?? "월 선택"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {completedMonthOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {completedSearchActive && (
                <p className="text-xs break-keep text-muted-foreground">
                  &ldquo;{query}&rdquo; 검색 결과 — 월 선택과 무관하게 전체 이력에서 찾았습니다.
                </p>
              )}
            </div>

            {completedLoading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : completedError ? (
              <p className="py-6 text-center text-sm text-destructive">{completedError}</p>
            ) : completedFilteredOrders.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {completedSearchActive ? "검색 결과가 없습니다." : "해당 월에 완료/정산된 대여 건이 없습니다."}
              </p>
            ) : (
              <ul className="space-y-2">
                {completedFilteredOrders.map((o) => (
                  <li
                    key={o.id}
                    className="w-full rounded-lg border border-l-4 border-l-zinc-400 bg-card/90 p-3 text-sm dark:border-l-zinc-500"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="min-w-0 break-keep font-medium">
                        {o.siteName}
                        <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                          ({o.clientName})
                          {o.teamName && ` · ${o.teamName}`}
                        </span>
                      </p>
                      <Badge className={CALENDAR_STATUS_STYLE.RETURNED.badgeClassName}>✅ 완료</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      현장 반입: <span className="font-medium text-foreground">{o.dispatchDate}</span>
                      {o.returnDate && (
                        <>
                          {" "}
                          · 현장 반출: <span className="font-medium text-foreground">{o.returnDate}</span>
                        </>
                      )}
                      {" "}· {totalDaysLabel(o, todayStr)}
                    </p>
                    {(o.equipmentItems.length > 0 || o.tigCount > 0 || o.co2Count > 0) && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        {o.equipmentItems.map((item) => (
                          <span
                            key={item.equipmentId}
                            className="rounded bg-muted px-1.5 py-0.5 text-xs whitespace-normal break-keep text-muted-foreground"
                          >
                            {item.name}
                          </span>
                        ))}
                        <WelderBadges tigCount={o.tigCount} co2Count={o.co2Count} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : isEmpty ? (
          mode === "pinned" && !normalizedQuery ? (
            <PinnedEmptyState tab="site" className="py-6 text-center text-sm text-muted-foreground" />
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">{emptyMessage}</p>
          )
        ) : (
          searchedGroups.map((group) => {
            const orderCount = group.clients.reduce((sum, c) => sum + c.orders.length, 0);
            const isExpanded = !collapsedSites.has(group.siteName);
            return (
              <div key={group.siteName} className="w-full rounded-lg border bg-background p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-start gap-1.5 text-left"
                    onClick={() => toggleSiteExpanded(group.siteName)}
                    aria-expanded={isExpanded}
                  >
                    <ChevronDown
                      className={cn(
                        "mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                        !isExpanded && "-rotate-90",
                      )}
                    />
                    <p className="min-w-0 break-keep font-medium">
                      {group.siteName}
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                        총 {group.clients.length}개 업체 · 대여 {orderCount}건
                      </span>
                    </p>
                  </button>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    <PinButton
                      pinned={pinnedSites.has(group.siteName)}
                      onToggle={() => togglePin("site", group.siteName)}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs whitespace-nowrap"
                      onClick={() => openNewRental({ clientName: "", siteName: group.siteName })}
                    >
                      <Plus className="h-3.5 w-3.5" /> 장비 추가 투입
                    </Button>
                  </div>
                </div>

                <div
                  className={cn(
                    "grid transition-[grid-template-rows] duration-200 ease-out",
                    isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                  )}
                >
                  <div className="overflow-hidden">
                    <div className="mt-2.5 space-y-3">
                      {group.clients.map((client) => (
                        <div key={client.clientName} className="border-l-2 border-muted-foreground/20 pl-2.5">
                          <p className="mb-1.5 text-xs font-semibold break-keep text-muted-foreground">
                            {client.clientName}
                            <span className="ml-1 font-normal">· 대여 {client.orders.length}건</span>
                          </p>

                          <ul className="space-y-2">
                            {client.orders.map((order) => (
                              <li
                                key={order.id}
                                className="flex w-full flex-wrap items-start justify-between gap-3 rounded-md border border-l-4 border-l-blue-600 bg-card/90 p-2"
                              >
                                <div className="min-w-0 flex-1 pr-3">
                                  <div className="mb-1 flex flex-wrap items-center gap-1.5">
                                    <Badge className={CALENDAR_STATUS_STYLE.ACTIVE.badgeClassName}>🚚 현장 가동중</Badge>
                                    {order.teamName && (
                                      <Badge className="border border-slate-500/30 bg-slate-500/10 text-slate-700 hover:bg-slate-500/10 dark:text-slate-300">
                                        {order.teamName}
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    현장 반입: <span className="font-medium text-foreground">{order.dispatchDate}</span>
                                    <span className="ml-1">({ongoingDaysLabel(order.dispatchDate, todayStr)})</span>
                                    {order.returnDate && (
                                      <>
                                        {" "}
                                        · 현장 반출예정:{" "}
                                        <span className="font-medium text-foreground">{order.returnDate}</span>
                                      </>
                                    )}
                                  </p>
                                  {order.equipmentItems.length > 0 || order.tigCount > 0 || order.co2Count > 0 ? (
                                    <div className="mt-1 flex flex-wrap items-center gap-1">
                                      {order.equipmentItems.map((item) => (
                                        <span key={item.equipmentId} className="inline-flex items-center gap-1">
                                          <button
                                            type="button"
                                            onClick={() => setQuickViewEquipmentId(item.equipmentId)}
                                            className="cursor-pointer rounded bg-muted px-1.5 py-0.5 text-xs whitespace-normal break-keep text-muted-foreground underline-offset-2 transition hover:bg-slate-200 hover:underline dark:hover:bg-slate-700"
                                          >
                                            {item.name}
                                          </button>
                                          {item.externalSupplierName && (
                                            <Badge className="border border-orange-500/30 bg-orange-500/15 text-orange-700 hover:bg-orange-500/15 dark:text-orange-300">
                                              외부 · {item.externalSupplierName}
                                            </Badge>
                                          )}
                                        </span>
                                      ))}
                                      <WelderBadges tigCount={order.tigCount} co2Count={order.co2Count} />
                                    </div>
                                  ) : (
                                    <p className="mt-1 text-xs text-muted-foreground italic">투입 발전기 없음</p>
                                  )}
                                </div>
                                <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 shrink-0 px-2 text-xs whitespace-nowrap text-muted-foreground hover:text-destructive"
                                    onClick={() => setCancelTarget({ id: order.id, orderNumber: order.orderNumber })}
                                  >
                                    <Undo2 className="h-3.5 w-3.5" /> 대여 취소
                                  </Button>
                                  <Button
                                    size="sm"
                                    className="h-7 shrink-0 px-2 text-xs whitespace-nowrap"
                                    onClick={() =>
                                      setReturnOrder({
                                        id: order.id,
                                        orderNumber: order.orderNumber,
                                        clientName: order.clientName,
                                        siteName: order.siteName,
                                      })
                                    }
                                  >
                                    <PackageCheck className="h-3.5 w-3.5" /> 현장 반출 처리
                                  </Button>
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </CardContent>

      <NewRentalDialog open={rentalDialogOpen} onOpenChange={setRentalDialogOpen} initialClientSite={rentalPrefill} />
      <ReturnOrderDialog
        open={returnOrder != null}
        onOpenChange={(open) => {
          if (!open) setReturnOrder(null);
        }}
        order={returnOrder}
      />
      <EquipmentQuickViewDialog
        open={quickViewEquipmentId != null}
        onOpenChange={(open) => {
          if (!open) setQuickViewEquipmentId(null);
        }}
        equipmentId={quickViewEquipmentId}
      />

      <AlertDialog open={cancelTarget !== null} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{cancelTarget?.orderNumber} 대여를 취소할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              배정됐던 발전기가 전부 사내(회사)로 즉시 원복되고, 이 대여 건은 완전히 삭제됩니다. 되돌릴 수
              없으며, 오입력으로 잘못 등록한 대여를 정리할 때만 사용하세요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>취소</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={cancelling} onClick={handleCancelDispatch}>
              {cancelling && <Loader2 className="h-4 w-4 animate-spin" />}
              대여 취소
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
