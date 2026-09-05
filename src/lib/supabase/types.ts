// 수동 작성된 Database 타입 정의 (supabase_schema.sql 과 1:1 대응)
// Supabase CLI가 연결되어 있지 않아 `supabase gen types`를 쓸 수 없으므로,
// 스키마 변경 시 이 파일도 함께 갱신해야 합니다.

export type EquipmentStatus = "AVAILABLE" | "RENTED" | "MAINTENANCE";
export type EquipmentOwnershipType = "OWNED" | "EXTERNAL";
export type RentalOrderStatus = "ACTIVE" | "COMPLETED";
export type ActivityAction = "CREATE" | "UPDATE" | "DELETE" | "DISPATCH" | "RETURN";
export type ActivityTargetType = "EQUIPMENT" | "ORDER" | "CLIENT" | "LOCATION";
export type UserRole = "ADMIN" | "MEMBER";

export interface ClientRow {
  id: string;
  name: string;
  last_used_at: string | null;
  is_active: boolean | null;
}

export interface ClientContactRow {
  id: string;
  client_id: string | null;
  contact_person: string;
  phone: string | null;
  last_used_at: string | null;
  created_at: string | null;
}

export interface LocationRow {
  id: string;
  name: string;
  last_used_at: string | null;
  is_active: boolean | null;
  is_site: boolean;
}

// 발전기 전용 — 용접기(티그/CO2)는 개별 자산 추적을 걷어내고 rental_orders.tig_count/
// co2_count(수량)로만 남았다.
export interface EquipmentRow {
  id: string;
  maker: string;
  capacity_kva: number;
  /** 일련번호(명판 번호) — 제조사/용량과 무관하게 전체 발전기가 공유하는 전역 번호. 유일성은 활성(is_deleted=false) 장비 범위에서만 강제되며, 폐기된 장비의 번호는 재사용 가능. 외부 차입(EXTERNAL) 장비는 번호가 없을 수 있어 null 허용. */
  serial_no: number | null;
  /** 외부 차입 장비의 자유 식별 라벨(예: '동양 1호') — serial_no가 없을 때 화면에서 대신 구분하는 용도. */
  external_tag: string | null;
  status: EquipmentStatus | null;
  current_location: string | null;
  last_oil_change_date: string | null;
  last_oil_change_hours: number | null;
  notes: string | null;
  is_deleted: boolean | null;
  /** 폐기(is_deleted=true) 처리 시각. 활성 장비는 null. */
  deleted_at: string | null;
  /** 'OWNED'(자사 보유, 기본값) | 'EXTERNAL'(외부 차입/전대) */
  ownership_type: EquipmentOwnershipType | null;
  /** 차입처(타 렌탈사) 상호 — ownership_type='EXTERNAL'일 때만 값이 있음 */
  supplier_name: string | null;
  created_at: string | null;
}

// 팀 마스터 — 대여를 등록한 조직 단위.
export interface TeamRow {
  id: string;
  name: string;
  created_at: string | null;
}

// 사용자 프로필 — auth.users에 소속 팀/권한을 붙인다. handle_new_user() 트리거가 가입
// 시 자동 생성하며, team_id/role은 관리자(ADMIN)가 배정한다.
export interface UserProfileRow {
  user_id: string;
  email: string;
  team_id: string | null;
  role: UserRole;
  created_at: string | null;
}

// 대여 전표 — 예약/사전 반입/시간 단위 대여 같은 세부 라이프사이클을 걷어낸 간소화
// 모델. 등록 즉시 대여가 확정되며(status='ACTIVE'), 현장 반출 처리 시 COMPLETED로 바뀐다.
export interface RentalOrderRow {
  id: string;
  order_number: string;
  client_id: string | null;
  client_name: string;
  site_name: string;
  /** 이 대여를 등록한 팀 — 미배정 가능 */
  team_id: string | null;
  /** 현장 반입일 — 소급/예정 상관없이 자유롭게 수정 가능 */
  dispatch_date: string;
  /** 현장 반출(완료 또는 예정)일 — complete_dispatch_return이 확정값으로 덮어씀 */
  return_date: string | null;
  /** 이 전표에 투입된 티그 용접기 수량 */
  tig_count: number;
  /** 이 전표에 투입된 CO2 용접기 수량 */
  co2_count: number;
  status: RentalOrderStatus | null;
  notes: string | null;
  created_at: string | null;
}

// 대여 전표 ↔ 발전기 매핑 — 순수 연결 테이블. 개별 장비의 상태/위치는
// equipments.status/current_location이 담당한다.
export interface RentalOrderEquipmentRow {
  id: string;
  order_id: string | null;
  equipment_id: string | null;
}

export type MaintenanceLogType = "START" | "COMPLETE";

export interface MaintenanceLogRow {
  id: string;
  equipment_id: string | null;
  service_date: string | null;
  service_type: string;
  service_hours: number | null;
  notes: string | null;
  user_email: string | null;
  log_type: MaintenanceLogType;
  created_at: string | null;
}

export interface ActivityLogRow {
  id: string;
  user_email: string | null;
  action: ActivityAction;
  target_type: ActivityTargetType;
  target_id: string | null;
  description: string;
  created_at: string | null;
}

export type PinTargetType = "site" | "equipment";

export interface UserPinRow {
  id: string;
  user_id: string;
  target_type: PinTargetType;
  target_id: string;
  created_at: string | null;
}

type TableDef<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      clients: TableDef<ClientRow>;
      client_contacts: TableDef<ClientContactRow>;
      locations: TableDef<LocationRow>;
      equipments: TableDef<EquipmentRow>;
      teams: TableDef<TeamRow>;
      user_profiles: TableDef<UserProfileRow>;
      rental_orders: TableDef<RentalOrderRow>;
      rental_order_equipments: TableDef<RentalOrderEquipmentRow>;
      maintenance_logs: TableDef<MaintenanceLogRow>;
      activity_logs: TableDef<ActivityLogRow>;
      user_pins: TableDef<UserPinRow>;
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}
