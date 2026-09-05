"use client";

import { useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { usePins } from "./pins-provider";
import { formatGeneratorLabel } from "@/lib/generator-label";
import type { EquipmentRow, LocationRow, PinTargetType } from "@/lib/supabase/types";

interface FavoriteManageModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab: PinTargetType;
}

export function FavoriteManageModal({ open, onOpenChange, initialTab }: FavoriteManageModalProps) {
  const { pinnedSites, pinnedEquipments, saveBatch } = usePins();

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [siteLocations, setSiteLocations] = useState<LocationRow[]>([]);
  const [equipments, setEquipments] = useState<EquipmentRow[]>([]);

  const [tab, setTab] = useState<PinTargetType>(initialTab);
  const [siteQuery, setSiteQuery] = useState("");
  const [equipmentQuery, setEquipmentQuery] = useState("");
  const [selectedSites, setSelectedSites] = useState<Set<string>>(new Set());
  const [selectedEquipments, setSelectedEquipments] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // 모달이 열릴 때(닫힘->열림)마다 목록을 새로 불러오고, 체크박스를 현재 DB 핀
  // 상태로 초기화한다. 렌더링 중 상태 조정 패턴(React 문서 권장)을 사용해
  // useEffect 없이 처리한다.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setTab(initialTab);
      setSiteQuery("");
      setEquipmentQuery("");
      setSelectedSites(new Set(pinnedSites));
      setSelectedEquipments(new Set(pinnedEquipments));
      setFormError(null);
      setLoadError(null);
      setLoading(true);

      const supabase = createClient();
      Promise.all([
        supabase.from("locations").select("*").eq("is_site", true).eq("is_active", true).returns<LocationRow[]>(),
        supabase.from("equipments").select("*").eq("is_deleted", false).returns<EquipmentRow[]>(),
      ])
        .then(([locationsRes, equipmentsRes]) => {
          const err = locationsRes.error ?? equipmentsRes.error ?? null;
          if (err) {
            setLoadError(err.message);
            return;
          }
          setSiteLocations(locationsRes.data ?? []);
          setEquipments(equipmentsRes.data ?? []);
        })
        .finally(() => setLoading(false));
    }
  }

  const filteredSites = useMemo(() => {
    const q = siteQuery.trim().toLowerCase();
    if (!q) return siteLocations;
    return siteLocations.filter((l) => l.name.toLowerCase().includes(q));
  }, [siteLocations, siteQuery]);

  const filteredEquipments = useMemo(() => {
    const q = equipmentQuery.trim().toLowerCase();
    if (!q) return equipments;
    return equipments.filter((eq) => formatGeneratorLabel(eq).toLowerCase().includes(q));
  }, [equipments, equipmentQuery]);

  function toggleSiteSelected(name: string) {
    setSelectedSites((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function toggleEquipmentSelected(id: string) {
    setSelectedEquipments((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSave() {
    setFormError(null);
    setSubmitting(true);
    const [sitesOk, equipmentsOk] = await Promise.all([
      saveBatch("site", Array.from(selectedSites)),
      saveBatch("equipment", Array.from(selectedEquipments)),
    ]);
    setSubmitting(false);

    if (!sitesOk || !equipmentsOk) {
      setFormError("일부 저장에 실패했습니다. 다시 시도해 주세요.");
      return;
    }

    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>⭐ 관심 대상 일괄 설정</DialogTitle>
          <DialogDescription>
            체크한 현장/장비가 대시보드와 장비 목록의 &quot;📌 내 관심만 보기&quot;에 표시됩니다.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-1 items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : loadError ? (
          <p className="flex-1 py-8 text-center text-sm text-destructive">{loadError}</p>
        ) : (
          <Tabs
            value={tab}
            onValueChange={(v) => setTab(v === "equipment" ? "equipment" : "site")}
            className="flex-1 overflow-hidden"
          >
            <TabsList>
              <TabsTrigger value="site">현장 ({selectedSites.size})</TabsTrigger>
              <TabsTrigger value="equipment">장비 ({selectedEquipments.size})</TabsTrigger>
            </TabsList>

            <TabsContent value="site" className="flex flex-col gap-2 overflow-hidden">
              <div className="relative">
                <Search className="absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={siteQuery}
                  onChange={(e) => setSiteQuery(e.target.value)}
                  placeholder="현장명 검색"
                  className="pl-8"
                />
              </div>
              <ScrollArea className="h-72 rounded-md border">
                <div className="divide-y">
                  {filteredSites.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">검색 결과가 없습니다.</p>
                  ) : (
                    filteredSites.map((loc) => (
                      <label
                        key={loc.id}
                        className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50"
                      >
                        <Checkbox
                          checked={selectedSites.has(loc.name)}
                          onCheckedChange={() => toggleSiteSelected(loc.name)}
                        />
                        {loc.name}
                      </label>
                    ))
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="equipment" className="flex flex-col gap-2 overflow-hidden">
              <div className="relative">
                <Search className="absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={equipmentQuery}
                  onChange={(e) => setEquipmentQuery(e.target.value)}
                  placeholder="관리번호 / 장비명 검색"
                  className="pl-8"
                />
              </div>
              <ScrollArea className="h-72 rounded-md border">
                <div className="divide-y">
                  {filteredEquipments.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">검색 결과가 없습니다.</p>
                  ) : (
                    filteredEquipments.map((eq) => (
                      <label
                        key={eq.id}
                        className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50"
                      >
                        <Checkbox
                          checked={selectedEquipments.has(eq.id)}
                          onCheckedChange={() => toggleEquipmentSelected(eq.id)}
                        />
                        <span className="flex-1">{formatGeneratorLabel(eq)}</span>
                      </label>
                    ))
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        )}

        {formError && <p className="text-sm text-destructive">{formError}</p>}

        <DialogFooter>
          <Button disabled={submitting || loading} onClick={handleSave}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
