"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { callRpc } from "@/lib/supabase/rpc";
import { getCurrentUserEmail } from "@/lib/current-user";
import type { ActionResult } from "@/lib/action-result";

export async function setEquipmentLocation(equipmentId: string, location: string): Promise<ActionResult> {
  const supabase = await createClient();
  const userEmail = await getCurrentUserEmail(supabase);

  const { error } = await callRpc(supabase, "set_equipment_location", {
    p_equipment_id: equipmentId,
    p_location: location,
    p_user_email: userEmail,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/equipments");
  revalidatePath("/");

  return { success: true };
}

export interface RegisterOilChangeInput {
  equipmentId: string;
  serviceDate: string;
  serviceHours: number | null;
  notes?: string;
}

/** 오일/필터 교환 등록 — 점검/수리중이던 장비는 이 등록을 완료 신호로 보고 대기로 되돌아간다. */
export async function registerOilChange(input: RegisterOilChangeInput): Promise<ActionResult> {
  const supabase = await createClient();
  const userEmail = await getCurrentUserEmail(supabase);

  const { error } = await callRpc(supabase, "register_oil_change", {
    p_equipment_id: input.equipmentId,
    p_service_date: input.serviceDate,
    p_service_hours: input.serviceHours,
    p_notes: input.notes || null,
    p_user_email: userEmail,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/equipments");
  revalidatePath("/");

  return { success: true };
}

/** 점검 완료 — 오일/필터 교환 없이도 점검/수리중인 장비를 대기로 되돌린다. */
export async function completeEquipmentMaintenance(equipmentId: string, notes?: string): Promise<ActionResult> {
  const supabase = await createClient();
  const userEmail = await getCurrentUserEmail(supabase);

  const { error } = await callRpc(supabase, "complete_equipment_maintenance", {
    p_equipment_id: equipmentId,
    p_notes: notes || null,
    p_user_email: userEmail,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/equipments");
  revalidatePath("/");

  return { success: true };
}

export interface CreateEquipmentInput {
  maker: string;
  capacityKva: number;
  /** 자사 보유(OWNED) 장비는 필수. 외부 차입(EXTERNAL) 장비는 명판 번호가 없을 수 있어 생략 가능. */
  serialNo?: number;
  currentLocation?: string;
  notes?: string;
  /** 'OWNED'(자사 보유, 기본값) | 'EXTERNAL'(외부 차입/전대) */
  ownershipType?: "OWNED" | "EXTERNAL";
  /** ownershipType이 'EXTERNAL'일 때 필수 — 차입처(타 렌탈사) 상호 */
  supplierName?: string;
  /** 번호가 없는 외부 차입 장비를 구분하기 위한 자유 식별 라벨 (예: '동양 1호') */
  externalTag?: string;
}

export async function createEquipment(
  input: CreateEquipmentInput,
): Promise<ActionResult<{ equipmentId: string }>> {
  const supabase = await createClient();
  const userEmail = await getCurrentUserEmail(supabase);

  const { data, error } = await callRpc<string>(supabase, "create_equipment", {
    p_maker: input.maker,
    p_capacity_kva: input.capacityKva,
    p_serial_no: input.serialNo ?? null,
    p_current_location: input.currentLocation || null,
    p_notes: input.notes || null,
    p_user_email: userEmail,
    p_ownership_type: input.ownershipType ?? "OWNED",
    p_supplier_name: input.supplierName || null,
    p_external_tag: input.externalTag || null,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/equipments");

  return { success: true, data: { equipmentId: data ?? "" } };
}

export interface UpdateEquipmentInfoInput {
  equipmentId: string;
  maker: string;
  capacityKva: number;
  /** 대상 장비가 자사 보유(OWNED)면 필수. 외부 차입(EXTERNAL)이면 생략 가능. */
  serialNo?: number;
  currentLocation?: string;
  notes?: string;
  externalTag?: string;
}

export async function updateEquipmentInfo(input: UpdateEquipmentInfoInput): Promise<ActionResult> {
  const supabase = await createClient();
  const userEmail = await getCurrentUserEmail(supabase);

  const { error } = await callRpc(supabase, "update_equipment_info", {
    p_equipment_id: input.equipmentId,
    p_maker: input.maker,
    p_capacity_kva: input.capacityKva,
    p_serial_no: input.serialNo ?? null,
    p_current_location: input.currentLocation || null,
    p_notes: input.notes || null,
    p_user_email: userEmail,
    p_external_tag: input.externalTag || null,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/equipments");
  revalidatePath("/");

  return { success: true };
}

/** 외부 차입(EXTERNAL) 장비를 협력사(차입처)로 반환 처리 — AVAILABLE 상태에서만 가능하며,
 * 처리 후에는 활성 장비 목록에서 제외된다(soft delete, discard_equipment와 동일한 결과). */
export async function returnExternalEquipment(equipmentId: string, notes?: string): Promise<ActionResult> {
  const supabase = await createClient();
  const userEmail = await getCurrentUserEmail(supabase);

  const { error } = await callRpc(supabase, "return_external_equipment", {
    p_equipment_id: equipmentId,
    p_notes: notes || null,
    p_user_email: userEmail,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/equipments");
  revalidatePath("/");

  return { success: true };
}

export async function startEquipmentMaintenance(equipmentId: string, reason: string): Promise<ActionResult> {
  const supabase = await createClient();
  const userEmail = await getCurrentUserEmail(supabase);

  const { error } = await callRpc(supabase, "start_equipment_maintenance", {
    p_equipment_id: equipmentId,
    p_reason: reason,
    p_user_email: userEmail,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/equipments");
  revalidatePath("/");

  return { success: true };
}

export async function discardEquipment(equipmentId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const userEmail = await getCurrentUserEmail(supabase);

  const { error } = await callRpc(supabase, "discard_equipment", {
    p_equipment_id: equipmentId,
    p_user_email: userEmail,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/equipments");
  revalidatePath("/");

  return { success: true };
}
