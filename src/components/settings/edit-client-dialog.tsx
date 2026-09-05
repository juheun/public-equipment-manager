"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { updateClient } from "@/app/actions/settings";
import type { ClientRow } from "@/lib/supabase/types";

interface EditClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: ClientRow | null;
}

export function EditClientDialog({ open, onOpenChange, client }: EditClientDialogProps) {
  const router = useRouter();

  const [name, setName] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const openKey = open && client ? client.id : null;
  const [prevOpenKey, setPrevOpenKey] = useState<string | null>(null);
  if (openKey !== prevOpenKey) {
    setPrevOpenKey(openKey);
    if (openKey && client) {
      setName(client.name);
      setIsActive(client.is_active ?? true);
      setFormError(null);
    }
  }

  if (!client) return null;

  async function handleSubmit() {
    if (!client) return;
    setFormError(null);
    if (!name.trim()) {
      setFormError("거래처명을 입력해 주세요.");
      return;
    }

    setSubmitting(true);
    const result = await updateClient({ clientId: client.id, name: name.trim(), isActive });
    setSubmitting(false);

    if (!result.success) {
      setFormError(result.error ?? "수정에 실패했습니다.");
      return;
    }

    toast.success("거래처 정보를 수정했습니다.");
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>거래처 정보 수정</DialogTitle>
          <DialogDescription>{client.name}의 이름과 사용 여부를 수정합니다.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="edit-client-name">거래처명</Label>
            <Input id="edit-client-name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={isActive} onCheckedChange={(v) => setIsActive(v === true)} />
            활성 거래처 (비활성화하면 대여 등록 시 자동완성 목록에서 제외됩니다)
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
