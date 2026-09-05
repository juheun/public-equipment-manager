"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { TextCombobox } from "@/components/shared/text-combobox";
import { createEquipment } from "@/app/actions/equipment";
import type { LocationRow } from "@/lib/supabase/types";

const MAKER_OPTIONS = ["도요", "덴요", "에어맨 구형", "에어맨 신형", "KW", "구형 발전기", "기타"];
const CAPACITY_PRESETS = [25, 60, 150, 300, 400, 500];

interface NewEquipmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locations: LocationRow[];
}

export function NewEquipmentDialog({ open, onOpenChange, locations }: NewEquipmentDialogProps) {
  const router = useRouter();

  const [maker, setMaker] = useState("");
  const [capacityKva, setCapacityKva] = useState("");
  const [serialNo, setSerialNo] = useState("");
  const [currentLocation, setCurrentLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [isExternal, setIsExternal] = useState(false);
  const [supplierName, setSupplierName] = useState("");
  const [externalTag, setExternalTag] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setMaker("");
      setCapacityKva("");
      setSerialNo("");
      setCurrentLocation("");
      setNotes("");
      setIsExternal(false);
      setSupplierName("");
      setExternalTag("");
      setFormError(null);
    }
  }

  // 신규 장비는 항상 대기(AVAILABLE) 상태로 시작하므로 사내 위치만 선택지로 보여준다.
  const internalLocations = locations.filter((l) => !l.is_site);

  async function handleSubmit() {
    setFormError(null);

    if (!maker.trim()) {
      setFormError("제조사를 입력해 주세요.");
      return;
    }
    const kva = Number(capacityKva);
    if (!capacityKva.trim() || Number.isNaN(kva) || kva <= 0) {
      setFormError("용량(kVA)을 올바르게 입력해 주세요.");
      return;
    }
    let unit: number | undefined;
    if (isExternal) {
      // 외부 차입 장비는 명판 번호가 없을 수 있어 비워 둘 수 있다 — 입력했다면 형식만 검증한다.
      if (serialNo.trim()) {
        unit = Number(serialNo);
        if (Number.isNaN(unit) || unit <= 0) {
          setFormError("번호를 올바르게 입력해 주세요.");
          return;
        }
      }
    } else {
      unit = Number(serialNo);
      if (!serialNo.trim() || Number.isNaN(unit) || unit <= 0) {
        setFormError("번호를 올바르게 입력해 주세요.");
        return;
      }
    }
    if (isExternal && !supplierName.trim()) {
      setFormError("차입처 상호를 입력해 주세요.");
      return;
    }

    setSubmitting(true);
    const result = await createEquipment({
      maker: maker.trim(),
      capacityKva: kva,
      serialNo: unit,
      currentLocation: currentLocation.trim() || undefined,
      notes: notes.trim() || undefined,
      ownershipType: isExternal ? "EXTERNAL" : "OWNED",
      supplierName: isExternal ? supplierName.trim() : undefined,
      externalTag: isExternal ? externalTag.trim() || undefined : undefined,
    });
    setSubmitting(false);

    if (!result.success) {
      setFormError(result.error ?? "등록에 실패했습니다.");
      return;
    }

    toast.success("발전기를 등록했습니다.");
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>새 발전기 등록</DialogTitle>
          <DialogDescription>제조사/용량/번호로 개별 관리하는 발전기를 등록합니다.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="new-eq-maker">
              제조사<span className="ml-0.5 text-destructive">*</span>
            </Label>
            <TextCombobox
              id="new-eq-maker"
              value={maker}
              onChange={setMaker}
              options={MAKER_OPTIONS}
              placeholder="제조사 선택 또는 직접 입력"
              className="mt-1"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="new-eq-kva">
                용량 (kVA)<span className="ml-0.5 text-destructive">*</span>
              </Label>
              <Input
                id="new-eq-kva"
                type="number"
                value={capacityKva}
                onChange={(e) => setCapacityKva(e.target.value)}
                placeholder="예: 300"
                className="mt-1"
                list="capacity-kva-presets"
              />
              <datalist id="capacity-kva-presets">
                {CAPACITY_PRESETS.map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
            </div>
            <div>
              <Label htmlFor="new-eq-serial-no">
                번호
                {isExternal ? " (선택)" : <span className="ml-0.5 text-destructive">*</span>}
              </Label>
              <Input
                id="new-eq-serial-no"
                type="number"
                value={serialNo}
                onChange={(e) => setSerialNo(e.target.value)}
                placeholder={isExternal ? "명판 번호를 모르면 비워두세요" : "예: 1"}
                className="mt-1"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="new-eq-location">현재 보관 위치</Label>
            <TextCombobox
              id="new-eq-location"
              value={currentLocation}
              onChange={setCurrentLocation}
              options={internalLocations.map((l) => l.name)}
              placeholder="기존 위치 선택 또는 신규 입력 (비워두면 회사)"
              className="mt-1"
              newItemLabel={(q) => `신규 위치로 등록: "${q}"`}
            />
          </div>
          <div className="space-y-2 rounded-md border p-2.5">
            <div className="flex items-center gap-2">
              <Checkbox
                id="new-eq-external"
                checked={isExternal}
                onCheckedChange={(v) => setIsExternal(v === true)}
              />
              <Label htmlFor="new-eq-external" className="cursor-pointer text-sm font-normal">
                외부 차입 장비 (자사 보유가 아닌 전대/서브렌탈)
              </Label>
            </div>
            {isExternal && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="new-eq-supplier-name">
                    차입처 상호<span className="ml-0.5 text-destructive">*</span>
                  </Label>
                  <Input
                    id="new-eq-supplier-name"
                    value={supplierName}
                    onChange={(e) => setSupplierName(e.target.value)}
                    placeholder="예: OO렌탈"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="new-eq-external-tag">식별 명칭 (선택)</Label>
                  <Input
                    id="new-eq-external-tag"
                    value={externalTag}
                    onChange={(e) => setExternalTag(e.target.value)}
                    placeholder="예: 동양 1호, 차입 A"
                    className="mt-1"
                  />
                </div>
              </div>
            )}
          </div>
          <div>
            <Label htmlFor="new-eq-notes">메모 (선택)</Label>
            <Textarea
              id="new-eq-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="특이사항이 있다면 입력해 주세요"
              className="mt-1"
              rows={2}
            />
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
