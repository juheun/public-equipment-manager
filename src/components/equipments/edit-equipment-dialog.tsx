"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { TextCombobox } from "@/components/shared/text-combobox";
import { updateEquipmentInfo } from "@/app/actions/equipment";
import { formatGeneratorLabel } from "@/lib/generator-label";
import type { EquipmentRow, LocationRow } from "@/lib/supabase/types";

const MAKER_OPTIONS = ["도요", "덴요", "에어맨 구형", "에어맨 신형", "KW", "구형 발전기", "기타"];

interface EditEquipmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  equipment: EquipmentRow | null;
  locations: LocationRow[];
}

export function EditEquipmentDialog({ open, onOpenChange, equipment, locations }: EditEquipmentDialogProps) {
  const router = useRouter();

  const [maker, setMaker] = useState("");
  const [capacityKva, setCapacityKva] = useState("");
  const [serialNo, setSerialNo] = useState("");
  const [externalTag, setExternalTag] = useState("");
  const [currentLocation, setCurrentLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // equipment가 바뀔 때(=새로 열릴 때) 폼을 초기화. open도 키에 포함해야 같은
  // 장비를 닫았다가 다시 열 때도 최신 값으로 다시 채워진다.
  const openKey = open && equipment ? equipment.id : null;
  const [prevOpenKey, setPrevOpenKey] = useState<string | null>(null);
  if (openKey !== prevOpenKey) {
    setPrevOpenKey(openKey);
    if (openKey && equipment) {
      setMaker(equipment.maker);
      setCapacityKva(String(equipment.capacity_kva));
      setSerialNo(equipment.serial_no != null ? String(equipment.serial_no) : "");
      setExternalTag(equipment.external_tag ?? "");
      setCurrentLocation(equipment.current_location ?? "");
      setNotes(equipment.notes ?? "");
      setFormError(null);
    }
  }

  if (!equipment) return null;

  // 외부 차입(EXTERNAL) 장비는 명판 번호가 없을 수 있어 필수 검증에서 제외한다.
  const isExternal = equipment.ownership_type === "EXTERNAL";

  // 출고중이면 위치는 현장이어야 하고, 대기/점검이면 사내 위치여야 한다.
  const isDispatched = equipment.status === "RENTED";
  const locationOptions = locations.filter((l) => l.is_site === isDispatched);

  async function handleSubmit() {
    if (!equipment) return;
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

    setSubmitting(true);
    const result = await updateEquipmentInfo({
      equipmentId: equipment.id,
      maker: maker.trim(),
      capacityKva: kva,
      serialNo: unit,
      currentLocation: currentLocation.trim() || undefined,
      notes: notes.trim() || undefined,
      externalTag: isExternal ? externalTag.trim() || undefined : undefined,
    });
    setSubmitting(false);

    if (!result.success) {
      setFormError(result.error ?? "수정에 실패했습니다.");
      return;
    }

    toast.success("장비 정보를 수정했습니다.");
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>장비 정보 수정</DialogTitle>
          <DialogDescription>{formatGeneratorLabel(equipment)}의 제조사, 용량, 번호, 위치를 수정합니다.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="edit-eq-maker">제조사</Label>
            <TextCombobox
              id="edit-eq-maker"
              value={maker}
              onChange={setMaker}
              options={MAKER_OPTIONS}
              className="mt-1"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="edit-eq-kva">용량 (kVA)</Label>
              <Input
                id="edit-eq-kva"
                type="number"
                value={capacityKva}
                onChange={(e) => setCapacityKva(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="edit-eq-serial-no">번호{isExternal && " (선택)"}</Label>
              <Input
                id="edit-eq-serial-no"
                type="number"
                value={serialNo}
                onChange={(e) => setSerialNo(e.target.value)}
                placeholder={isExternal ? "명판 번호를 모르면 비워두세요" : undefined}
                className="mt-1"
              />
            </div>
          </div>
          {isExternal && (
            <div>
              <Label htmlFor="edit-eq-external-tag">식별 명칭 (선택)</Label>
              <Input
                id="edit-eq-external-tag"
                value={externalTag}
                onChange={(e) => setExternalTag(e.target.value)}
                placeholder="예: 동양 1호, 차입 A"
                className="mt-1"
              />
            </div>
          )}
          <div>
            <Label htmlFor="edit-eq-location">현재 보관 위치</Label>
            <TextCombobox
              id="edit-eq-location"
              value={currentLocation}
              onChange={setCurrentLocation}
              options={locationOptions.map((l) => l.name)}
              className="mt-1"
              newItemLabel={(q) => `신규 ${isDispatched ? "현장" : "위치"}으로 등록: "${q}"`}
            />
          </div>
          <div>
            <Label htmlFor="edit-eq-notes">메모</Label>
            <Textarea
              id="edit-eq-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1"
              rows={2}
            />
          </div>

          {formError && <p className="text-sm text-destructive">{formError}</p>}
        </div>

        <DialogFooter>
          <Button disabled={submitting} onClick={handleSubmit}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
