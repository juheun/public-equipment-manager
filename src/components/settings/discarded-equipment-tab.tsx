"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { restoreEquipment, hardDeleteEquipment } from "@/app/actions/settings";
import { formatGeneratorLabel } from "@/lib/generator-label";
import type { EquipmentRow } from "@/lib/supabase/types";

interface DiscardedEquipmentTabProps {
  equipments: EquipmentRow[];
  equipmentIdsWithHistory: Set<string>;
}

export function DiscardedEquipmentTab({ equipments, equipmentIdsWithHistory }: DiscardedEquipmentTabProps) {
  const router = useRouter();
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<EquipmentRow | null>(null);

  async function handleRestore(equipment: EquipmentRow) {
    setRestoringId(equipment.id);
    const result = await restoreEquipment(equipment.id);
    setRestoringId(null);

    if (!result.success) {
      toast.error(result.error ?? "복구에 실패했습니다.");
      return;
    }
    toast.success(`${formatGeneratorLabel(equipment)}을(를) 원상 복구했습니다.`);
    router.refresh();
  }

  async function handleHardDelete(equipment: EquipmentRow) {
    setDeletingId(equipment.id);
    const result = await hardDeleteEquipment(equipment.id);
    setDeletingId(null);

    if (!result.success) {
      toast.error(result.error ?? "완전 삭제에 실패했습니다.");
      return;
    }
    toast.success(`${formatGeneratorLabel(equipment)}을(를) 완전 삭제했습니다.`);
    setConfirmTarget(null);
    router.refresh();
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">삭제된 장비</CardTitle>
        </CardHeader>
        <CardContent>
          {equipments.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">삭제(폐기) 처리된 장비가 없습니다.</p>
          ) : (
            <ul className="space-y-1.5">
              {equipments.map((eq) => {
                const hasHistory = equipmentIdsWithHistory.has(eq.id);
                return (
                  <li
                    key={eq.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-background p-2.5 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="font-medium break-keep">{formatGeneratorLabel(eq)}</p>
                      <p className="text-xs text-muted-foreground">
                        삭제 일시: {eq.deleted_at ? new Date(eq.deleted_at).toLocaleString("ko-KR") : "-"}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={restoringId === eq.id}
                        onClick={() => handleRestore(eq)}
                      >
                        {restoringId === eq.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Undo2 className="h-3.5 w-3.5" />
                        )}
                        복구
                      </Button>
                      {!hasHistory && (
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={deletingId === eq.id}
                          onClick={() => setConfirmTarget(eq)}
                        >
                          {deletingId === eq.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                          영구 삭제
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmTarget !== null} onOpenChange={(open) => !open && setConfirmTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>장비를 영구 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmTarget && formatGeneratorLabel(confirmTarget)} 데이터가 DB에서 완전히 제거되며 되돌릴 수
              없습니다. 대여 이력이 없는 장비만 이 작업이 가능합니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingId !== null}>취소</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deletingId !== null}
              onClick={() => confirmTarget && handleHardDelete(confirmTarget)}
            >
              {deletingId !== null && <Loader2 className="h-4 w-4 animate-spin" />}
              영구 삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
