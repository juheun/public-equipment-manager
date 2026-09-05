"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { completeDispatchReturn } from "@/app/actions/rentals";
import { toKstDateString } from "@/lib/date";
import type { LocationRow } from "@/lib/supabase/types";

export interface ReturnOrderSummary {
  id: string;
  orderNumber: string;
  clientName: string;
  siteName: string;
}

interface ReturnOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: ReturnOrderSummary | null;
}

/** 현장 반출 처리 — 전표에 딸린 발전기 전부를 지정한 입고 장소로 되돌린다. */
export function ReturnOrderDialog({ open, onOpenChange, order }: ReturnOrderDialogProps) {
  const router = useRouter();
  const today = toKstDateString();

  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [actualReturnDate, setActualReturnDate] = useState(today);
  const [returnLocation, setReturnLocation] = useState("회사");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const openKey = open && order ? order.id : null;
  const [prevOpenKey, setPrevOpenKey] = useState<string | null>(null);
  if (openKey !== prevOpenKey) {
    setPrevOpenKey(openKey);
    if (openKey) {
      setActualReturnDate(today);
      setReturnLocation("회사");
      setFormError(null);
    }
  }

  useEffect(() => {
    if (!open) return;
    const supabase = createClient();
    let cancelled = false;

    supabase
      .from("locations")
      .select("*")
      .eq("is_active", true)
      .eq("is_site", false)
      .order("name")
      .returns<LocationRow[]>()
      .then((res) => {
        if (cancelled || res.error) return;
        setLocations(res.data ?? []);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!order) return null;

  async function handleSubmit() {
    if (!order) return;
    setFormError(null);
    if (!returnLocation.trim()) {
      setFormError("입고 장소를 입력해 주세요.");
      return;
    }

    setSubmitting(true);
    const result = await completeDispatchReturn({
      orderId: order.id,
      actualReturnDate,
      returnLocation: returnLocation.trim(),
    });
    setSubmitting(false);

    if (!result.success) {
      toast.error(result.error ?? "현장 반출 처리에 실패했습니다.");
      return;
    }
    toast.success(`${order.orderNumber} 현장 반출 처리되었습니다.`);
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>현장 반출 처리</DialogTitle>
          <DialogDescription>
            {order.orderNumber} · {order.siteName} ({order.clientName})의 발전기 전부를 입고 처리합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="actual-return-date">실제 현장 반출일</Label>
            <Input
              id="actual-return-date"
              type="date"
              value={actualReturnDate}
              onChange={(e) => setActualReturnDate(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="return-location">입고 장소</Label>
            <TextCombobox
              id="return-location"
              value={returnLocation}
              onChange={setReturnLocation}
              options={locations.map((l) => l.name)}
              className="mt-1"
              newItemLabel={(q) => `신규 위치로 등록: "${q}"`}
            />
          </div>

          {formError && <p className="text-sm text-destructive">{formError}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" disabled={submitting} onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button disabled={submitting} onClick={handleSubmit}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            현장 반출 처리
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
