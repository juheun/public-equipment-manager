"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClientsTab } from "./clients-tab";
import { LocationsTab } from "./locations-tab";
import { DiscardedEquipmentTab } from "./discarded-equipment-tab";
import { ActivityLogTab } from "./activity-log-tab";
import { ExportTab } from "./export-tab";
import type { ActivityLogRow, ClientContactRow, ClientRow, EquipmentRow, LocationRow } from "@/lib/supabase/types";

interface SettingsExplorerProps {
  clients: ClientRow[];
  clientContacts: ClientContactRow[];
  locations: LocationRow[];
  discardedEquipment: EquipmentRow[];
  equipmentIdsWithHistory: Set<string>;
  activityLogs: ActivityLogRow[];
}

export function SettingsExplorer({
  clients,
  clientContacts,
  locations,
  discardedEquipment,
  equipmentIdsWithHistory,
  activityLogs,
}: SettingsExplorerProps) {
  return (
    <Tabs defaultValue="locations">
      <TabsList>
        <TabsTrigger value="locations">현장/보관 장소</TabsTrigger>
        <TabsTrigger value="clients">거래처</TabsTrigger>
        <TabsTrigger value="discarded">삭제된 장비</TabsTrigger>
        <TabsTrigger value="activity">작업 로그</TabsTrigger>
        <TabsTrigger value="export">데이터 백업</TabsTrigger>
      </TabsList>

      <TabsContent value="locations" className="mt-4">
        <LocationsTab locations={locations} />
      </TabsContent>
      <TabsContent value="clients" className="mt-4">
        <ClientsTab clients={clients} clientContacts={clientContacts} />
      </TabsContent>
      <TabsContent value="discarded" className="mt-4">
        <DiscardedEquipmentTab equipments={discardedEquipment} equipmentIdsWithHistory={equipmentIdsWithHistory} />
      </TabsContent>
      <TabsContent value="activity" className="mt-4">
        <ActivityLogTab logs={activityLogs} />
      </TabsContent>
      <TabsContent value="export" className="mt-4">
        <ExportTab />
      </TabsContent>
    </Tabs>
  );
}
