"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { updateLocation } from "@/app/actions/settings";
import type { LocationRow } from "@/lib/supabase/types";

interface EditLocationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  location: LocationRow | null;
}

export function EditLocationDialog({ open, onOpenChange, location }: EditLocationDialogProps) {
  const router = useRouter();

  const [name, setName] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [isSite, setIsSite] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const openKey = open && location ? location.id : null;
  const [prevOpenKey, setPrevOpenKey] = useState<string | null>(null);
  if (openKey !== prevOpenKey) {
    setPrevOpenKey(openKey);
    if (openKey && location) {
      setName(location.name);
      setIsActive(location.is_active ?? true);
      setIsSite(location.is_site);
      setFormError(null);
    }
  }

  if (!location) return null;

  async function handleSubmit() {
    if (!location) return;
    setFormError(null);
    if (!name.trim()) {
      setFormError("장소명을 입력해 주세요.");
      return;
    }

    setSubmitting(true);
    const result = await updateLocation({ locationId: location.id, name: name.trim(), isActive, isSite });
    setSubmitting(false);

    if (!result.success) {
      setFormError(result.error ?? "수정에 실패했습니다.");
      return;
    }

    toast.success("장소 정보를 수정했습니다.");
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>장소 정보 수정</DialogTitle>
          <DialogDescription>{location.name}의 명칭과 사용 여부를 수정합니다.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="edit-location-name">장소명</Label>
            <Input id="edit-location-name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="edit-location-type">구분</Label>
            <Select value={isSite ? "SITE" : "INTERNAL"} onValueChange={(v) => setIsSite(v === "SITE")}>
              <SelectTrigger id="edit-location-type" className="mt-1 w-full">
                <SelectValue>{(value: string | null) => (value === "SITE" ? "외부 투입 현장" : "사내 보관 위치")}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="INTERNAL">사내 보관 위치 (본사측)</SelectItem>
                <SelectItem value="SITE">외부 투입 현장</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={isActive} onCheckedChange={(v) => setIsActive(v === true)} />
            활성 장소 (숨기면 위치/현장 자동완성 목록에서 제외됩니다)
          </label>
          {formError && <p className="text-sm text-destructive">{formError}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" disabled={submitting} onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button disabled={submitting} onClick={handleSubmit}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
