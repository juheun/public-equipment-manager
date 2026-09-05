"use client";

import { useState } from "react";
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
import { createClientRecord } from "@/app/actions/settings";

interface NewClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewClientDialog({ open, onOpenChange }: NewClientDialogProps) {
  const router = useRouter();

  const [name, setName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setName("");
      setContactPerson("");
      setPhone("");
      setFormError(null);
    }
  }

  async function handleSubmit() {
    setFormError(null);
    if (!name.trim()) {
      setFormError("거래처명을 입력해 주세요.");
      return;
    }

    setSubmitting(true);
    const result = await createClientRecord({
      name: name.trim(),
      contactPerson: contactPerson.trim() || undefined,
      phone: phone.trim() || undefined,
    });
    setSubmitting(false);

    if (!result.success) {
      setFormError(result.error ?? "등록에 실패했습니다.");
      return;
    }

    toast.success("거래처를 등록했습니다.");
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>새 거래처 등록</DialogTitle>
          <DialogDescription>발주 업체명을 입력해 등록합니다.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="new-client-name">
              거래처명<span className="ml-0.5 text-destructive">*</span>
            </Label>
            <Input
              id="new-client-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: (주)새별이엔지"
              className="mt-1"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="new-client-contact">담당자명 (선택)</Label>
              <Input
                id="new-client-contact"
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                placeholder="예: 홍길동 과장"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="new-client-phone">연락처 (선택)</Label>
              <Input
                id="new-client-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="예: 010-1234-5678"
                className="mt-1"
              />
            </div>
          </div>
          {formError && <p className="text-sm text-destructive">{formError}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" disabled={submitting} onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button disabled={submitting} onClick={handleSubmit}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            등록
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
