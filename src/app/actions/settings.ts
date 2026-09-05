"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { callRpc } from "@/lib/supabase/rpc";
import { getCurrentUserEmail } from "@/lib/current-user";
import type { ActionResult } from "@/lib/action-result";

export interface UpdateClientInput {
  clientId: string;
  name: string;
  isActive: boolean;
}

export async function updateClient(input: UpdateClientInput): Promise<ActionResult> {
  const supabase = await createClient();
  const userEmail = await getCurrentUserEmail(supabase);

  const { error } = await callRpc(supabase, "update_client", {
    p_client_id: input.clientId,
    p_name: input.name,
    p_is_active: input.isActive,
    p_user_email: userEmail,
  });

  if (error) return { success: false, error: error.message };

  revalidatePath("/settings");
  return { success: true };
}

export interface CreateClientInput {
  name: string;
  contactPerson?: string;
  phone?: string;
}

export async function createClientRecord(input: CreateClientInput): Promise<ActionResult<{ clientId: string }>> {
  const supabase = await createClient();
  const userEmail = await getCurrentUserEmail(supabase);

  const { data, error } = await callRpc<string>(supabase, "create_client", {
    p_name: input.name,
    p_contact_person: input.contactPerson || null,
    p_phone: input.phone || null,
    p_user_email: userEmail,
  });

  if (error) return { success: false, error: error.message };

  revalidatePath("/settings");
  return { success: true, data: { clientId: data ?? "" } };
}

export interface UpdateLocationInput {
  locationId: string;
  name: string;
  isActive: boolean;
  isSite: boolean;
}

export async function updateLocation(input: UpdateLocationInput): Promise<ActionResult> {
  const supabase = await createClient();
  const userEmail = await getCurrentUserEmail(supabase);

  const { error } = await callRpc(supabase, "update_location", {
    p_location_id: input.locationId,
    p_name: input.name,
    p_is_active: input.isActive,
    p_is_site: input.isSite,
    p_user_email: userEmail,
  });

  if (error) return { success: false, error: error.message };

  revalidatePath("/settings");
  return { success: true };
}

export interface CreateLocationInput {
  name: string;
  isSite: boolean;
}

export async function createLocationRecord(input: CreateLocationInput): Promise<ActionResult<{ locationId: string }>> {
  const supabase = await createClient();
  const userEmail = await getCurrentUserEmail(supabase);

  const { data, error } = await callRpc<string>(supabase, "create_location", {
    p_name: input.name,
    p_is_site: input.isSite,
    p_user_email: userEmail,
  });

  if (error) return { success: false, error: error.message };

  revalidatePath("/settings");
  return { success: true, data: { locationId: data ?? "" } };
}

export async function restoreEquipment(equipmentId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const userEmail = await getCurrentUserEmail(supabase);

  const { error } = await callRpc(supabase, "restore_equipment", {
    p_equipment_id: equipmentId,
    p_user_email: userEmail,
  });

  if (error) return { success: false, error: error.message };

  revalidatePath("/settings");
  revalidatePath("/equipments");
  return { success: true };
}

export async function hardDeleteEquipment(equipmentId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const userEmail = await getCurrentUserEmail(supabase);

  const { error } = await callRpc(supabase, "hard_delete_equipment", {
    p_equipment_id: equipmentId,
    p_user_email: userEmail,
  });

  if (error) return { success: false, error: error.message };

  revalidatePath("/settings");
  revalidatePath("/equipments");
  return { success: true };
}
