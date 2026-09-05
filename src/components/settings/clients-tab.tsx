"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NewClientDialog } from "./new-client-dialog";
import { EditClientDialog } from "./edit-client-dialog";
import type { ClientContactRow, ClientRow } from "@/lib/supabase/types";

interface ClientsTabProps {
  clients: ClientRow[];
  clientContacts: ClientContactRow[];
}

export function ClientsTab({ clients, clientContacts }: ClientsTabProps) {
  const [newOpen, setNewOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<ClientRow | null>(null);

  // 거래처별 가장 최근에 쓰인 담당자를 "대표 연락처"로 보여준다.
  const representativeContactByClientId = useMemo(() => {
    const map = new Map<string, ClientContactRow>();
    for (const contact of clientContacts) {
      if (!contact.client_id) continue;
      const current = map.get(contact.client_id);
      if (!current || (contact.last_used_at ?? "") > (current.last_used_at ?? "")) {
        map.set(contact.client_id, contact);
      }
    }
    return map;
  }, [clientContacts]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">거래처 (발주업체) 관리</CardTitle>
        <Button size="sm" onClick={() => setNewOpen(true)}>
          <Plus className="h-4 w-4" /> 새 거래처 등록
        </Button>
      </CardHeader>
      <CardContent>
        {clients.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">등록된 거래처가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">업체명</th>
                  <th className="py-2 pr-3 font-medium">담당자</th>
                  <th className="py-2 pr-3 font-medium">연락처</th>
                  <th className="py-2 pr-3 font-medium">최근 거래일</th>
                  <th className="py-2 pr-3 font-medium">상태</th>
                  <th className="py-2 pr-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => {
                  const contact = representativeContactByClientId.get(client.id);
                  return (
                    <tr key={client.id} className="border-b last:border-b-0">
                      <td className="py-2 pr-3 font-medium">{client.name}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{contact?.contact_person ?? "-"}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{contact?.phone ?? "-"}</td>
                      <td className="py-2 pr-3 text-muted-foreground">
                        {client.last_used_at ? client.last_used_at.slice(0, 10) : "-"}
                      </td>
                      <td className="py-2 pr-3">
                        {client.is_active ? (
                          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300">
                            활성
                          </Badge>
                        ) : (
                          <Badge className="bg-zinc-100 text-zinc-500 hover:bg-zinc-100 dark:bg-zinc-800 dark:text-zinc-400">
                            비활성
                          </Badge>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right">
                        <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setEditingClient(client)}>
                          수정
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      <NewClientDialog open={newOpen} onOpenChange={setNewOpen} />
      <EditClientDialog
        open={editingClient != null}
        onOpenChange={(open) => {
          if (!open) setEditingClient(null);
        }}
        client={editingClient}
      />
    </Card>
  );
}
