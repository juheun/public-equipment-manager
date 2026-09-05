"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EditLocationDialog } from "./edit-location-dialog";
import { NewLocationDialog } from "./new-location-dialog";
import { PinButton } from "@/components/shared/pin-button";
import { usePins } from "@/components/shared/pins-provider";
import type { LocationRow } from "@/lib/supabase/types";

interface LocationsTabProps {
  locations: LocationRow[];
}

export function LocationsTab({ locations }: LocationsTabProps) {
  const [newOpen, setNewOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<LocationRow | null>(null);
  const { pinnedSites, togglePin } = usePins();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">현장 / 보관 장소 관리</CardTitle>
        <Button size="sm" onClick={() => setNewOpen(true)}>
          <Plus className="h-4 w-4" /> 새 장소 등록
        </Button>
      </CardHeader>
      <CardContent>
        {locations.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">등록된 장소가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">장소명</th>
                  <th className="py-2 pr-3 font-medium">구분</th>
                  <th className="py-2 pr-3 font-medium">최근 사용일</th>
                  <th className="py-2 pr-3 font-medium">상태</th>
                  <th className="py-2 pr-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {locations.map((location) => (
                  <tr key={location.id} className="border-b last:border-b-0">
                    <td className="py-2 pr-3 font-medium">{location.name}</td>
                    <td className="py-2 pr-3">
                      {location.is_site ? (
                        <Badge className="bg-sky-100 text-sky-800 hover:bg-sky-100 dark:bg-sky-950 dark:text-sky-300">
                          외부 현장
                        </Badge>
                      ) : (
                        <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300">
                          사내 위치
                        </Badge>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground">
                      {location.last_used_at ? location.last_used_at.slice(0, 10) : "-"}
                    </td>
                    <td className="py-2 pr-3">
                      {location.is_active ? (
                        <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300">
                          활성
                        </Badge>
                      ) : (
                        <Badge className="bg-zinc-100 text-zinc-500 hover:bg-zinc-100 dark:bg-zinc-800 dark:text-zinc-400">
                          숨김
                        </Badge>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {location.is_site && (
                          <PinButton
                            pinned={pinnedSites.has(location.name)}
                            onToggle={() => togglePin("site", location.name)}
                          />
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          onClick={() => setEditingLocation(location)}
                        >
                          수정
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      <NewLocationDialog open={newOpen} onOpenChange={setNewOpen} />
      <EditLocationDialog
        open={editingLocation != null}
        onOpenChange={(open) => {
          if (!open) setEditingLocation(null);
        }}
        location={editingLocation}
      />
    </Card>
  );
}
