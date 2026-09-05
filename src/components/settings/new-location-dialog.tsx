"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { createLocationRecord } from "@/app/actions/settings";

interface NewLocationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewLocationDialog({ open, onOpenChange }: NewLocationDialogProps) {
  const router = useRouter();

  const [name, setName] = useState("");
  const [isSite, setIsSite] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setName("");
      setIsSite(false);
      setFormError(null);
    }
  }

  async function handleSubmit() {
    setFormError(null);
    if (!name.trim()) {
      setFormError("장소명을 입력해 주세요.");
      return;
    }

    setSubmitting(true);
    const result = await createLocationRecord({ name: name.trim(), isSite });
    setSubmitting(false);

    if (!result.success) {
      setFormError(result.error ?? "등록에 실패했습니다.");
      return;
    }

    toast.success("장소를 등록했습니다.");
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>새 현장/보관 장소 등록</DialogTitle>
          <DialogDescription>사내 보관 위치 또는 외부 투입 현장명을 입력해 등록합니다.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="new-location-name">장소명</Label>
            <Input
              id="new-location-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 2번 야적장"
              className="mt-1"
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="new-location-type">구분</Label>
            <Select value={isSite ? "SITE" : "INTERNAL"} onValueChange={(v) => setIsSite(v === "SITE")}>
              <SelectTrigger id="new-location-type" className="mt-1 w-full">
                <SelectValue>{(value: string | null) => (value === "SITE" ? "외부 투입 현장" : "사내 보관 위치")}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="INTERNAL">사내 보관 위치 (본사측)</SelectItem>
                <SelectItem value="SITE">외부 투입 현장</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {formError && <p className="text-sm text-destructive">{formError}</p>}
        </div>

        <DialogFooter>
          <Button disabled={submitting} onClick={handleSubmit}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            등록
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
