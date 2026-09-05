"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { callRpc } from "@/lib/supabase/rpc";
import { getCurrentUserEmail } from "@/lib/current-user";
import type { ActionResult } from "@/lib/action-result";

export interface RegisterDispatchInput {
  siteName: string;
  clientName: string;
  equipmentIds: string[];
  tigCount: number;
  co2Count: number;
  notes?: string;
  /** 현장 반입일 — 생략하면 오늘 */
  dispatchDate?: string;
  /** 현장 반출 예정일 — 선택 */
  returnDate?: string;
  teamId?: string;
  /** 현장 직송 시 이전 ACTIVE 전표별로 스텝퍼로 지정한 동반 이관 수량 — 각 전표의
   * 잔여 티그/CO2 수량 중 지정한 만큼만 이번 새 전표로 넘어가고 나머지는 이전
   * 전표에 남는다. */
  swungWelders?: { orderId: string; tigCount: number; co2Count: number }[];
}

/** 대여 등록 — 등록 즉시 확정(ACTIVE)되며, 선택된 발전기는 바로 현장으로 이동 처리된다. */
export async function registerDispatch(
  input: RegisterDispatchInput,
): Promise<ActionResult<{ orderId: string }>> {
  const supabase = await createClient();
  const userEmail = await getCurrentUserEmail(supabase);

  const { data, error } = await callRpc<string>(supabase, "register_dispatch", {
    p_site_name: input.siteName,
    p_client_name: input.clientName,
    p_equipment_ids: input.equipmentIds,
    p_tig_count: input.tigCount,
    p_co2_count: input.co2Count,
    p_notes: input.notes || null,
    p_user_email: userEmail,
    p_dispatch_date: input.dispatchDate || null,
    p_return_date: input.returnDate || null,
    p_team_id: input.teamId || null,
    p_swung_welders: (input.swungWelders ?? []).map((w) => ({
      order_id: w.orderId,
      tig_count: w.tigCount,
      co2_count: w.co2Count,
    })),
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/");
  revalidatePath("/equipments");

  return { success: true, data: { orderId: data ?? "" } };
}

export interface CompleteDispatchReturnInput {
  orderId: string;
  actualReturnDate?: string;
  returnLocation?: string;
}

/** 현장 반출 처리 — 전표를 통째로 완료 처리하고, 딸린 발전기 전부를 지정한 장소로 복귀시킨다. */
export async function completeDispatchReturn(input: CompleteDispatchReturnInput): Promise<ActionResult> {
  const supabase = await createClient();
  const userEmail = await getCurrentUserEmail(supabase);

  const { error } = await callRpc(supabase, "complete_dispatch_return", {
    p_order_id: input.orderId,
    p_user_email: userEmail,
    p_actual_return_date: input.actualReturnDate || null,
    p_return_location: input.returnLocation || null,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/");
  revalidatePath("/equipments");

  return { success: true };
}

/** 대여 취소(오입력 대응) — ACTIVE 전표만 취소 가능. 배정됐던 발전기 전부를 사내(회사)로
 * 즉시 복귀시키고, 전표/연결 데이터를 완전히 삭제한다(간소화 모델엔 CANCELLED 상태가 없음). */
export async function cancelDispatch(orderId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const userEmail = await getCurrentUserEmail(supabase);

  const { error } = await callRpc(supabase, "cancel_dispatch", {
    p_order_id: orderId,
    p_user_email: userEmail,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/");
  revalidatePath("/equipments");

  return { success: true };
}
