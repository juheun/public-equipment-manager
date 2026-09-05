import { addMonths, eachDayOfInterval, endOfMonth, format, getDay, startOfMonth } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type DayEquipmentItem, type MonthCalendarDay } from "@/components/dashboard/month-calendar";
import { DashboardMonthCalendar } from "@/components/dashboard/dashboard-month-calendar";
import { DashboardKpiCards } from "@/components/dashboard/dashboard-kpi-cards";
import { RentalOrdersPanel, type OrderEquipmentItem, type OrderSummary } from "@/components/dashboard/rental-orders-panel";
import { CategoryLocationMatrix } from "@/components/dashboard/category-location-matrix";
import { DashboardFilterToggle } from "@/components/dashboard/dashboard-filter-toggle";
import { FavoriteManageButton } from "@/components/dashboard/favorite-manage-button";
import { createClient } from "@/lib/supabase/server";
import { getKstTodayAsLocalDate, parseMonthParam, toKstDateString } from "@/lib/date";
import { formatGeneratorLabel } from "@/lib/generator-label";
import type { EquipmentRow, RentalOrderEquipmentRow, RentalOrderRow, TeamRow } from "@/lib/supabase/types";

type MonthOrder = Pick<
  RentalOrderRow,
  | "id"
  | "order_number"
  | "client_name"
  | "site_name"
  | "team_id"
  | "dispatch_date"
  | "return_date"
  | "tig_count"
  | "co2_count"
  | "status"
>;

export const revalidate = 0;

interface DashboardPageProps {
  searchParams: Promise<{ month?: string }>;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const supabase = await createClient();
  const { month: monthParam } = await searchParams;

  const kstToday = getKstTodayAsLocalDate();
  const todayStr = toKstDateString();
  const monthStart = monthParam ? (parseMonthParam(monthParam) ?? startOfMonth(kstToday)) : startOfMonth(kstToday);
  const monthEnd = endOfMonth(monthStart);
  const monthStartStr = format(monthStart, "yyyy-MM-dd");
  const monthEndStr = format(monthEnd, "yyyy-MM-dd");

  const [
    equipmentsResult,
    monthOrdersResult,
    todayOrdersResult,
    activeOrdersResult,
    activeOrderEquipmentsResult,
    teamsResult,
  ] = await Promise.all([
    supabase.from("equipments").select("*").eq("is_deleted", false).returns<EquipmentRow[]>(),
    // 현장 반입일(dispatch_date) 또는 현장 반출일(return_date)이 이 달에 걸치는 주문을 모두 가져온다.
    supabase
      .from("rental_orders")
      .select(
        "id, order_number, client_name, site_name, team_id, dispatch_date, return_date, tig_count, co2_count, status",
      )
      .or(
        `and(dispatch_date.gte.${monthStartStr},dispatch_date.lte.${monthEndStr}),` +
          `and(return_date.gte.${monthStartStr},return_date.lte.${monthEndStr})`,
      )
      .returns<MonthOrder[]>(),
    // 캘린더가 다른 달을 보고 있어도 "오늘" 통계는 항상 실제 오늘 기준이어야 하므로 별도 조회.
    supabase
      .from("rental_orders")
      .select("id, site_name, dispatch_date, return_date, status")
      .or(`dispatch_date.eq.${todayStr},return_date.eq.${todayStr}`)
      .returns<Pick<RentalOrderRow, "id" | "site_name" | "dispatch_date" | "return_date" | "status">[]>(),
    supabase
      .from("rental_orders")
      .select("id, order_number, client_name, site_name, team_id, dispatch_date, return_date, tig_count, co2_count, status")
      .eq("status", "ACTIVE")
      .order("dispatch_date")
      .returns<
        Pick<
          RentalOrderRow,
          | "id"
          | "order_number"
          | "client_name"
          | "site_name"
          | "team_id"
          | "dispatch_date"
          | "return_date"
          | "tig_count"
          | "co2_count"
          | "status"
        >[]
      >(),
    supabase.from("rental_order_equipments").select("*").returns<RentalOrderEquipmentRow[]>(),
    supabase.from("teams").select("*").returns<TeamRow[]>(),
  ]);

  const fetchError =
    equipmentsResult.error ??
    monthOrdersResult.error ??
    todayOrdersResult.error ??
    activeOrdersResult.error ??
    activeOrderEquipmentsResult.error ??
    teamsResult.error ??
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
  const monthOrders = monthOrdersResult.data ?? [];
  const todayOrders = todayOrdersResult.data ?? [];

  const equipmentById = new Map(equipments.map((eq) => [eq.id, eq]));
  const teamNameById = new Map((teamsResult.data ?? []).map((t) => [t.id, t.name]));

  // 장비는 이름 문자열이 아니라 구조화된 항목으로 모은다 — 대시보드에서 장비 뱃지를
  // 클릭해 상세 모달을 열 수 있어야 하기 때문. 월별 캘린더의 일별 상세 팝업은 자체
  // 알약형 배지 포맷("12번 · 도요 300kVA")을 조립하므로 원본 필드 그대로(DayEquipmentItem)
  // 별도로 모은다 — activeOrderEquipmentsResult는 상태와 무관하게 전체 rental_order_equipments를
  // 담고 있어 COMPLETED 전표(월간 반출 이력)에도 그대로 쓸 수 있다.
  const equipmentItemsByOrderId = new Map<string, OrderEquipmentItem[]>();
  const dayEquipmentItemsByOrderId = new Map<string, DayEquipmentItem[]>();
  for (const oe of activeOrderEquipmentsResult.data ?? []) {
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

    const dayList = dayEquipmentItemsByOrderId.get(oe.order_id) ?? [];
    dayList.push(eq);
    dayEquipmentItemsByOrderId.set(oe.order_id, dayList);
  }

  const activeOrders: OrderSummary[] = (activeOrdersResult.data ?? []).map((o) => ({
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
  }));

  const todayDispatchOrders = todayOrders.filter((o) => o.dispatch_date === todayStr);
  const todayReturnOrders = todayOrders.filter((o) => o.return_date === todayStr && o.status === "ACTIVE");
  const activeSiteOrders = activeOrders;

  const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const calendarDays: MonthCalendarDay[] = monthDays.map((date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    const toOrderInfo = (o: MonthOrder) => ({
      id: o.id,
      clientName: o.client_name,
      siteName: o.site_name,
      status: o.status,
      dispatchDate: o.dispatch_date,
      returnDate: o.return_date,
      teamId: o.team_id,
      teamName: o.team_id ? (teamNameById.get(o.team_id) ?? null) : null,
      tigCount: o.tig_count,
      co2Count: o.co2_count,
      equipmentItems: dayEquipmentItemsByOrderId.get(o.id) ?? [],
    });
    return {
      day: date.getDate(),
      dateStr,
      isToday: dateStr === todayStr,
      dispatchOrders: monthOrders.filter((o) => o.dispatch_date === dateStr).map(toOrderInfo),
      returnOrders: monthOrders.filter((o) => o.return_date === dateStr).map(toOrderInfo),
    };
  });

  const monthLabel = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
  }).format(monthStart);

  const currentMonthStr = format(startOfMonth(kstToday), "yyyy-MM");
  const prevMonthHref = `/?month=${format(addMonths(monthStart, -1), "yyyy-MM")}`;
  const nextMonthHref = `/?month=${format(addMonths(monthStart, 1), "yyyy-MM")}`;
  const isCurrentMonth = format(monthStart, "yyyy-MM") === currentMonthStr;

  const todayLabel = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(kstToday);

  return (
    <div className="space-y-6">
      {/* 1구역: 컨트롤 바 + KPI 요약 카드 */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div>
            <h1 className="text-xl font-semibold">대시보드</h1>
            <p className="text-sm text-muted-foreground">{todayLabel}</p>
          </div>
          <DashboardFilterToggle />
        </div>
        <FavoriteManageButton />
      </div>

      <DashboardKpiCards
        todayDispatchOrders={todayDispatchOrders.map((o) => ({ id: o.id, siteName: o.site_name }))}
        todayReturnOrders={todayReturnOrders.map((o) => ({ id: o.id, siteName: o.site_name }))}
        activeSiteOrders={activeSiteOrders.map((o) => ({ id: o.id, siteName: o.siteName }))}
      />

      {/* 2층: 발전기 보유 현황 — 전체 너비로 펼쳐서 가로 스크롤 없이 한눈에 보이게 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">발전기 보유 현황</CardTitle>
        </CardHeader>
        <CardContent>
          <CategoryLocationMatrix equipments={equipments} />
        </CardContent>
      </Card>

      {/* 3층(메인 작업): 대여 현황 — 실무에서 가장 자주 손대는 영역 */}
      <RentalOrdersPanel activeOrders={activeOrders} todayStr={todayStr} />

      {/* 4층: 월별 캘린더 — 전체 너비로 펼쳐서 일정 바/점이 시원하게 보이도록 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">월별 캘린더</CardTitle>
        </CardHeader>
        <CardContent>
          <DashboardMonthCalendar
            monthLabel={monthLabel}
            leadingBlanks={getDay(monthStart)}
            days={calendarDays}
            prevMonthHref={prevMonthHref}
            nextMonthHref={nextMonthHref}
            todayMonthHref={isCurrentMonth ? undefined : "/"}
          />
        </CardContent>
      </Card>
    </div>
  );
}
