"use client";

import { useMemo } from "react";
import { Activity, PackageCheck, Truck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useDashboardFilterMode } from "./dashboard-filter-scope";
import { usePins } from "@/components/shared/pins-provider";

interface OrderSiteInfo {
  id: string;
  siteName: string;
}

interface DashboardKpiCardsProps {
  todayDispatchOrders: OrderSiteInfo[];
  todayReturnOrders: OrderSiteInfo[];
  activeSiteOrders: OrderSiteInfo[];
}

export function DashboardKpiCards({ todayDispatchOrders, todayReturnOrders, activeSiteOrders }: DashboardKpiCardsProps) {
  const { pinnedSites } = usePins();
  const mode = useDashboardFilterMode();

  const { dispatchCount, returnCount, activeSiteCount } = useMemo(() => {
    const activeSites =
      mode !== "pinned" ? activeSiteOrders : activeSiteOrders.filter((o) => pinnedSites.has(o.siteName));
    // 전표(주문) 건수가 아니라 "지금 장비가 나가 있는 서로 다른 현장 수"를 센다 — 한
    // 현장에 거래처별로 전표가 여러 건 잡혀 있어도 현장 자체는 1곳으로만 잡아야
    // "현장 가동중"이라는 라벨과 실제 집계 기준이 어긋나지 않는다.
    const activeSiteCount = new Set(activeSites.map((o) => o.siteName)).size;

    if (mode !== "pinned") {
      return { dispatchCount: todayDispatchOrders.length, returnCount: todayReturnOrders.length, activeSiteCount };
    }
    return {
      dispatchCount: todayDispatchOrders.filter((o) => pinnedSites.has(o.siteName)).length,
      returnCount: todayReturnOrders.filter((o) => pinnedSites.has(o.siteName)).length,
      activeSiteCount,
    };
  }, [mode, todayDispatchOrders, todayReturnOrders, activeSiteOrders, pinnedSites]);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <Card>
        <CardContent className="flex items-center gap-4 py-4">
          <div className="rounded-full bg-blue-100 p-2.5 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
            <Truck className="h-5 w-5" />
          </div>
          <div>
            <p className="text-2xl font-bold leading-none">{dispatchCount}건</p>
            <p className="mt-1 text-sm text-muted-foreground">🚚 오늘 현장 반입</p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="flex items-center gap-4 py-4">
          <div className="rounded-full bg-orange-100 p-2.5 text-orange-700 dark:bg-orange-950 dark:text-orange-300">
            <PackageCheck className="h-5 w-5" />
          </div>
          <div>
            <p className="text-2xl font-bold leading-none">{returnCount}건</p>
            <p className="mt-1 text-sm text-muted-foreground">📦 오늘 현장 반출 예정</p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="flex items-center gap-4 py-4">
          <div className="rounded-full bg-emerald-100 p-2.5 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <p className="text-2xl font-bold leading-none">{activeSiteCount}곳</p>
            <p className="mt-1 text-sm text-muted-foreground">가동중인 현장</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
