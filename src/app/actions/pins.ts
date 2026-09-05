"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserId } from "@/lib/current-user";
import { insertRows } from "@/lib/supabase/insert-rows";
import type { ActionResult } from "@/lib/action-result";
import type { PinTargetType, UserPinRow } from "@/lib/supabase/types";

export interface UserPinsResult {
  sites: string[];
  equipments: string[];
}

// user_pins는 대시보드/장비 목록의 클라이언트 상태(PinsProvider)에서만 읽으므로,
// 이 파일의 액션들은 다른 서버 렌더 데이터에 영향을 주지 않아 revalidatePath가
// 필요 없다 — 화면은 각 액션 호출부의 낙관적 업데이트로 즉시 반영된다.
export async function getUserPins(): Promise<UserPinsResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_pins")
    .select("target_type, target_id")
    .returns<Pick<UserPinRow, "target_type" | "target_id">[]>();

  if (error || !data) return { sites: [], equipments: [] };

  return {
    sites: data.filter((p) => p.target_type === "site").map((p) => p.target_id),
    equipments: data.filter((p) => p.target_type === "equipment").map((p) => p.target_id),
  };
}

export async function togglePin(targetType: PinTargetType, targetId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const userId = await getCurrentUserId(supabase);
  if (!userId) return { success: false, error: "로그인이 필요합니다." };

  const { data: existing, error: selectError } = await supabase
    .from("user_pins")
    .select("id")
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .returns<Pick<UserPinRow, "id">[]>();

  if (selectError) return { success: false, error: selectError.message };

  if (existing && existing.length > 0) {
    const { error } = await supabase.from("user_pins").delete().eq("id", existing[0].id);
    if (error) return { success: false, error: error.message };
  } else {
    const { error } = await insertRows(supabase, "user_pins", {
      user_id: userId,
      target_type: targetType,
      target_id: targetId,
    });
    if (error) return { success: false, error: error.message };
  }

  return { success: true };
}

export async function saveBatchPins(targetType: PinTargetType, targetIds: string[]): Promise<ActionResult> {
  const supabase = await createClient();
  const userId = await getCurrentUserId(supabase);
  if (!userId) return { success: false, error: "로그인이 필요합니다." };

  const uniqueIds = Array.from(new Set(targetIds));

  const { data: existingRows, error: selectError } = await supabase
    .from("user_pins")
    .select("target_id")
    .eq("target_type", targetType)
    .returns<Pick<UserPinRow, "target_id">[]>();

  if (selectError) return { success: false, error: selectError.message };

  const existingIds = new Set((existingRows ?? []).map((r) => r.target_id));
  const toAdd = uniqueIds.filter((id) => !existingIds.has(id));
  const toRemove = Array.from(existingIds).filter((id) => !uniqueIds.includes(id));

  if (toRemove.length > 0) {
    const { error } = await supabase.from("user_pins").delete().eq("target_type", targetType).in("target_id", toRemove);
    if (error) return { success: false, error: error.message };
  }

  if (toAdd.length > 0) {
    const { error } = await insertRows(
      supabase,
      "user_pins",
      toAdd.map((id) => ({ user_id: userId, target_type: targetType, target_id: id })),
    );
    if (error) return { success: false, error: error.message };
  }

  return { success: true };
}
