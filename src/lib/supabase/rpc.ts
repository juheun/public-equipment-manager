import type { PostgrestError } from "@supabase/supabase-js";

/**
 * `.rpc()`의 FnName/Args 제네릭도 select()와 동일한 타입 추론 붕괴(never) 문제를 겪는다.
 * `.returns<T>()`가 select 체인의 공식 우회 방법인 것처럼, rpc 호출은 이 wrapper로 감싸서
 * 반환 타입만 명시적으로 지정한다. supabase 클라이언트 타입 자체는 건드리지 않는다.
 */
export async function callRpc<TResult>(
  supabase: unknown,
  fnName: string,
  args: Record<string, unknown>,
): Promise<{ data: TResult | null; error: PostgrestError | null }> {
  const client = supabase as {
    rpc: (
      fn: string,
      args: Record<string, unknown>,
    ) => PromiseLike<{ data: unknown; error: PostgrestError | null }>;
  };
  const { data, error } = await client.rpc(fnName, args);
  return { data: (data as TResult) ?? null, error };
}
