import type { PostgrestError } from "@supabase/supabase-js";

/**
 * `.insert()`도 select()/rpc()와 같은 타입 추론 붕괴(never) 문제를 겪는다 — 이 프로젝트가
 * 손으로 작성한 Database 타입과 현재 postgrest-js 버전의 조합에서 Insert 제네릭이 항상
 * never로 붕괴한다. 지금까지는 모든 쓰기가 RPC(callRpc)를 거쳐서 드러나지 않았는데,
 * user_pins가 이 프로젝트 최초로 RPC 없이 테이블에 직접 insert하는 사례라 처음 드러났다.
 * callRpc와 동일하게 좁은 구조적 타입으로 캐스팅해서 우회한다.
 */
export async function insertRows<TRow extends Record<string, unknown>>(
  supabase: unknown,
  table: string,
  rows: TRow | TRow[],
): Promise<{ error: PostgrestError | null }> {
  const client = supabase as {
    from: (table: string) => {
      insert: (values: TRow | TRow[]) => PromiseLike<{ error: PostgrestError | null }>;
    };
  };
  const { error } = await client.from(table).insert(rows);
  return { error };
}
