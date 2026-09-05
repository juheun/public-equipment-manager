import { createClient } from "@/lib/supabase/server";
import { jsonBackupResponse, todayStamp } from "@/lib/csv";

const TABLES = [
  "clients",
  "client_contacts",
  "locations",
  "equipments",
  "teams",
  "rental_orders",
  "rental_order_equipments",
  "maintenance_logs",
  "activity_logs",
] as const;

export async function GET() {
  const supabase = await createClient();

  const results = await Promise.all(TABLES.map((table) => supabase.from(table).select("*")));

  const error = results.find((r) => r.error)?.error;
  if (error) {
    return new Response(error.message, { status: 500 });
  }

  const backup: Record<string, unknown> = {
    exported_at: new Date().toISOString(),
  };
  TABLES.forEach((table, i) => {
    backup[table] = results[i].data ?? [];
  });

  return jsonBackupResponse(`full-backup_${todayStamp()}.json`, backup);
}
