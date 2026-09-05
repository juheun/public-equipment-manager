import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 로그인한 계정의 이메일 — activity_logs 등 감사 로그에 남길 요청자 식별자.
 * 세션이 없으면(이론상 미들웨어가 이미 /login으로 보냈어야 하는 상태) "unknown"으로 대체한다.
 */
export async function getCurrentUserEmail(supabase: SupabaseClient): Promise<string> {
  const { data } = await supabase.auth.getUser();
  return data.user?.email ?? "unknown";
}

/**
 * 로그인한 계정의 UUID — user_pins처럼 auth.users(id)를 참조하며 auth.uid() 기반
 * RLS로 소유권을 검사하는 테이블에 쓴다. 세션이 없으면 null(호출부에서 처리).
 */
export async function getCurrentUserId(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}
