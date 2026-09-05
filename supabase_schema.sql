-- =============================================================================
-- 산업용 장비 및 부속품 통합 렌탈·재고 관리 시스템 — Supabase 스키마
-- =============================================================================
-- 이 파일은 SPEC.md 2장(데이터베이스 스키마 설계)을 그대로 반영하며,
-- 인덱스 / CHECK 제약 / RLS / 초기 테스트 데이터를 추가로 포함합니다.
--
-- 실행 방법: Supabase Dashboard > SQL Editor 에 전체 내용을 붙여넣고 Run.
-- 주의: 아래 DROP TABLE 블록은 개발/초기 세팅용입니다. 기존 데이터가 있는
--       운영 환경에서는 절대 그대로 실행하지 마세요.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Extensions
-- -----------------------------------------------------------------------------
-- Supabase 프로젝트는 기본적으로 pgcrypto를 extensions 스키마에 활성화하여
-- gen_random_uuid()를 search_path에 노출합니다. 안전을 위해 명시적으로 보장합니다.
create extension if not exists pgcrypto with schema extensions;

-- -----------------------------------------------------------------------------
-- 0. Dev reset (fresh DB에서만 사용) — FK 역순으로 DROP
-- -----------------------------------------------------------------------------
drop table if exists user_pins cascade;
drop table if exists user_profiles cascade;
drop table if exists activity_logs cascade;
drop table if exists maintenance_logs cascade;
drop table if exists rental_order_equipments cascade;
drop table if exists rental_orders cascade;
drop table if exists equipments cascade;
drop table if exists locations cascade;
drop table if exists client_contacts cascade;
drop table if exists clients cascade;
drop table if exists teams cascade;

-- =============================================================================
-- 1. 테이블 정의
-- =============================================================================

-- 2. 거래처 / 현장 마스터 (자동 누적 및 드롭다운 선택)
create table clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,          -- 거래처명 (예: 가온산업, OO이엔지 등)
    last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(), -- 최근 사용 순 정렬용
    is_active BOOLEAN DEFAULT true
);

-- 2-1. 거래처 담당자 (한 거래처에 담당자가 여러 명일 수 있음 — 1:N)
create table client_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    contact_person TEXT NOT NULL,       -- 현장 담당자
    phone TEXT,                          -- 연락처
    last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. 보관 장소 마스터 (자동 누적 및 드롭다운 선택)
create table locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,          -- 예: 회사, 온산샵, 미르화학, 청람에너지파크
    last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true,
    is_site BOOLEAN NOT NULL DEFAULT false -- true=외부 투입 현장, false=사내 보관 위치(본사측)
);

-- 4. 발전기 (개별 관리) — 시스템 간소화 1단계로 용접기(티그/CO2)는 개별 자산 추적을
-- 완전히 걷어내고 rental_orders.tig_count/co2_count(수량)로만 남겼다. 이 테이블은
-- 발전기 전용이다.
create table equipments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    maker TEXT NOT NULL,                -- 제조사 (예: 도요, 덴요, 에어맨 구형, 에어맨 신형, KW, 기타)
    capacity_kva INTEGER NOT NULL,      -- 용량(kVA) (예: 25, 60, 150, 300, 400, 500)
    -- 일련번호(도장/명판 번호) — 제조사/용량과 무관하게 전체 발전기가 공유하는 전역
    -- 번호다(예: 1번, 12번, 450번). "동일 기종 내 몇 번째 호기"가 아니라 장비 한 대마다
    -- 붙는 고유 식별표라 "호기"라는 표현을 쓰지 않는다. 유일성은 "현재 활성(살아있는)
    -- 장비" 범위에서만 강제한다(아래 idx_equipments_serial_no_active 부분 유니크
    -- 인덱스) — 장비를 폐기(is_deleted=true)하면 그 번호는 다시 신규 등록에 쓸 수
    -- 있다. 오입력으로 잘못 등록/삭제한 경우를 위해 설정(/settings) > 삭제된 장비
    -- 탭에서 복구(restore_equipment)하거나, 대여 이력이 전혀 없는 건에 한해 완전
    -- 삭제(hard_delete_equipment)할 수 있다.
    -- 외부 차입(전대) 장비는 우리 쪽 명판 번호 체계에 편입돼 있지 않은 경우가 많아
    -- NULL을 허용한다 — 그 대신 external_tag(자유 식별 라벨)로 구분한다. 자사 보유
    -- (OWNED) 장비는 create_equipment/update_equipment_info RPC가 여전히 번호를 필수로
    -- 검증한다.
    serial_no INTEGER,
    -- 외부 차입 장비의 자유 식별 라벨 (예: '늘봄 1호', '차입-A'). serial_no가 없는
    -- 외부 장비를 화면에서 구분하기 위한 용도로, 자사 보유 장비는 보통 비워 둔다.
    external_tag TEXT,
    status VARCHAR DEFAULT 'AVAILABLE', -- 'AVAILABLE'(대기), 'RENTED'(출고중), 'MAINTENANCE'(점검/수리중)
    current_location TEXT DEFAULT '회사', -- 현재 보관 위치
    last_oil_change_date DATE,          -- 최근 오일/필터 교환일
    last_oil_change_hours INTEGER,      -- 교환 당시 아워미터
    notes TEXT,
    is_deleted BOOLEAN DEFAULT false,   -- Soft Delete 플래그
    deleted_at TIMESTAMP WITH TIME ZONE, -- 폐기 처리 시각 (설정 > 삭제된 장비 탭 표시용)
    -- 외부 차입(전대/Sub-rental) 발전기 지원 — 자사 보유 장비만으로 물량이 부족할 때
    -- 타 렌탈사에서 잠시 빌려와 함께 배차하는 경우를 위한 필드. OWNED가 기본값이라
    -- 기존 데이터/RPC 호출은 전혀 영향받지 않는다.
    ownership_type TEXT NOT NULL DEFAULT 'OWNED', -- 'OWNED'(자사 보유) | 'EXTERNAL'(외부 차입)
    supplier_name TEXT,                 -- 차입처(타 렌탈사) 상호 — EXTERNAL일 때만 값이 있음
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT equipments_status_check CHECK (status IN ('AVAILABLE', 'RENTED', 'MAINTENANCE')),
    CONSTRAINT equipments_capacity_kva_positive_check CHECK (capacity_kva > 0),
    CONSTRAINT equipments_serial_no_positive_check CHECK (serial_no IS NULL OR serial_no > 0),
    CONSTRAINT equipments_ownership_type_check CHECK (ownership_type IN ('OWNED', 'EXTERNAL'))
);

-- 5. 팀 마스터 — 배차를 등록한 조직 단위(예: 1팀, 2팀, 영업팀). rental_orders.team_id가
-- 이 테이블을 참조해 "어느 팀이 배차했는지"를 기록한다.
create table teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. 사용자 프로필 — auth.users(로그인 계정)에 소속 팀/권한을 붙인다. 이 테이블의 행은
-- handle_new_user() 트리거(가입 시 자동 생성)로만 만들어지며, team_id/role 배정은
-- 관리자(ADMIN)가 직접 수정한다. role='ADMIN'이면 team_id와 무관하게 전체 팀의
-- 데이터를 열람/관리할 수 있는 총괄 권한을 갖는다(RLS의 is_admin() 참고).
create table user_profiles (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
    role TEXT NOT NULL DEFAULT 'MEMBER',
    created_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT user_profiles_role_check CHECK (role IN ('ADMIN', 'MEMBER'))
);

-- 7. 배차 전표(대여 주문) 마스터 — 시스템 간소화 1단계: 예약(RESERVED)/사전 반입/시간 단위
-- 대여 같은 세부 라이프사이클은 실무에서 잘 안 쓰이면서 복잡도만 키웠기에 걷어내고,
-- "등록하는 순간 이미 배차가 확정된다"는 최소 모델만 남긴다. 상태는 ACTIVE(현장에
-- 나가 있음) / COMPLETED(전량 반입 완료) 둘뿐이다.
create table rental_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number TEXT NOT NULL UNIQUE,  -- 전표번호 (예: R-20260901-001)
    client_id UUID REFERENCES clients(id),
    client_name TEXT NOT NULL,          -- 발주/정산 업체명 (직접 입력값 보존, 예: '(주)새별이엔지')
    site_name TEXT NOT NULL,            -- 실제 투입 현장/야드명 (직접 입력값 보존, 예: '미르화학')
    team_id UUID REFERENCES teams(id) ON DELETE SET NULL, -- 이 배차를 등록한 팀 (미배정 가능)
    dispatch_date DATE NOT NULL DEFAULT CURRENT_DATE, -- 반출일 — 소급/예정 상관없이 자유롭게 수정 가능
    return_date DATE,                   -- 반입 완료일(또는 예정일) — complete_dispatch_return이 확정값으로 덮어씀
    tig_count INTEGER NOT NULL DEFAULT 0, -- 이 전표에 투입된 티그 용접기 수량
    co2_count INTEGER NOT NULL DEFAULT 0, -- 이 전표에 투입된 CO2 용접기 수량
    status VARCHAR NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE'(현장 출고중), 'COMPLETED'(반입 완료)
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT rental_orders_status_check CHECK (status IN ('ACTIVE', 'COMPLETED')),
    CONSTRAINT rental_orders_date_range_check CHECK (return_date IS NULL OR return_date >= dispatch_date),
    CONSTRAINT rental_orders_tig_count_nonneg_check CHECK (tig_count >= 0),
    CONSTRAINT rental_orders_co2_count_nonneg_check CHECK (co2_count >= 0)
);

-- 8. 배차 전표 ↔ 발전기 매핑 (1:N) — 순수 연결 테이블. 개별 장비의 반출/반입 상태와
-- 위치는 equipments.status/current_location이 그대로 담당하므로(장비마다 따로 상태를
-- 들지 않는다), 여기서는 "어느 전표로 어느 장비가 나갔는지" 이력만 남긴다.
create table rental_order_equipments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES rental_orders(id) ON DELETE CASCADE,
    equipment_id UUID REFERENCES equipments(id)
);

-- 10. 정비 이력 로그
create table maintenance_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    equipment_id UUID REFERENCES equipments(id),
    service_date DATE DEFAULT CURRENT_DATE,
    service_type TEXT NOT NULL,         -- 오일/필터 교환, 점검/수리 입고 등
    service_hours INTEGER,              -- 정비/교환 시점 아워미터 (모를 경우 null)
    notes TEXT,
    user_email TEXT,
    log_type TEXT NOT NULL DEFAULT 'COMPLETE', -- 'START'(점검/수리 입고) | 'COMPLETE'(점검/수리 완료)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT maintenance_logs_log_type_check CHECK (log_type IN ('START', 'COMPLETE'))
);

-- 11. 작업 로그 (Audit Log)
create table activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_email TEXT,
    action VARCHAR NOT NULL,            -- 'CREATE', 'UPDATE', 'DELETE', 'DISPATCH', 'RETURN'
    target_type VARCHAR NOT NULL,        -- 'EQUIPMENT', 'ORDER', 'CLIENT', 'LOCATION'
    target_id UUID,
    description TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT activity_logs_action_check CHECK (
        action IN ('CREATE', 'UPDATE', 'DELETE', 'DISPATCH', 'RETURN')
    ),
    CONSTRAINT activity_logs_target_type_check CHECK (
        target_type IN ('EQUIPMENT', 'ORDER', 'CLIENT', 'LOCATION')
    )
);

-- 12. 사용자별 관심(핀) 현장/장비 — 브라우저 로컬 저장이 아닌 계정 기준 DB 저장이라
-- PC/모바일 등 어느 기기로 로그인해도 동일하게 동기화된다. auth.users를 참조하는
-- 이 스키마 최초의 테이블: 다른 테이블들은 user_email(TEXT)로 작성자만 기록하지만,
-- 이건 "내 것"을 조회/삭제하는 소유권 검사가 필요해 auth.uid() 기반으로 설계했다.
create table user_pins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    target_type VARCHAR(20) NOT NULL,   -- 'site' | 'equipment'
    target_id TEXT NOT NULL,            -- target_type='site'면 현장명, 'equipment'면 equipments.id(uuid 문자열)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT user_pins_target_type_check CHECK (target_type IN ('site', 'equipment')),
    CONSTRAINT user_pins_unique UNIQUE (user_id, target_type, target_id)
);

-- =============================================================================
-- 2. 인덱스
-- =============================================================================

create index idx_client_contacts_client_id on client_contacts(client_id);

create index idx_equipments_maker_capacity on equipments(maker, capacity_kva);
create index idx_equipments_status on equipments(status);
create index idx_equipments_active_status on equipments(status) where is_deleted = false;
-- 번호(serial_no) 유일성은 "현재 활성 장비" 범위에서만 강제한다. 폐기된 장비는
-- 이 부분 인덱스에서 제외되므로 그 번호를 새 장비 등록에 다시 쓸 수 있다. 번호가
-- 없는(NULL) 외부 차입 장비는 애초에 유일성 검사 대상이 아니므로 함께 제외한다
-- (NULL은 표준 유니크 인덱스에서도 서로 충돌하지 않지만, 의도를 명확히 하기 위해
-- 조건절에 명시한다).
create unique index equipments_serial_no_active_key on equipments (serial_no) where is_deleted = false and serial_no is not null;

create index idx_user_profiles_team_id on user_profiles(team_id);

create index idx_rental_orders_client_id on rental_orders(client_id);
create index idx_rental_orders_team_id on rental_orders(team_id);
create index idx_rental_orders_status on rental_orders(status);
create index idx_rental_orders_date_range on rental_orders(dispatch_date, return_date);

create index idx_roe_order_id on rental_order_equipments(order_id);
create index idx_roe_equipment_id on rental_order_equipments(equipment_id);

create index idx_maintenance_logs_equipment_id on maintenance_logs(equipment_id);
create index idx_maintenance_logs_service_date on maintenance_logs(service_date);

create index idx_activity_logs_target on activity_logs(target_type, target_id);
create index idx_activity_logs_created_at on activity_logs(created_at);

create index idx_user_pins_lookup on user_pins(user_id, target_type);

-- =============================================================================
-- 3. Row Level Security
-- =============================================================================
-- 사내 운영툴 전용 스키마입니다. 로그인한 사용자(authenticated)에게만 전면(CRUD)
-- 접근을 허용합니다. Supabase Auth 로그인(/login) + 라우트 가드(proxy.ts)가 붙은
-- 이후로는 anon(비로그인) 요청을 테이블 권한 수준에서 완전히 회수합니다 — 과거에는
-- 로그인 화면이 없어 anon에게 SELECT만 열어뒀지만, 이제는 그 예외가 없습니다.
-- ⚠️ 이 블록을 실제 운영 중인 Supabase 프로젝트에 적용하기 전에, Supabase
--    Dashboard(Authentication > Users > Add user)에서 관리자 계정을 먼저
--    만들어 두세요. 그렇지 않으면 이 스키마 적용 즉시 아무도 로그인하지 못한
--    상태로 데이터 접근이 완전히 막힙니다.

-- is_admin(): user_profiles RLS 정책(및 RPC 내부 권한 체크)에서 재사용하는 헬퍼.
-- user_profiles 자신을 조회하는 정책 안에서 다시 user_profiles를 조회해야 하므로,
-- 일반 함수로 두면 RLS가 그 내부 조회에도 재귀 적용돼 무한 재귀/권한 오류로 이어진다.
-- SECURITY DEFINER로 만들어 이 함수 내부의 조회만큼은 RLS를 우회하도록 한다 — 함수가
-- 반환하는 값 자체는 "로그인한 나 자신이 ADMIN인가"라는 단순 boolean이라 안전하다.
create or replace function is_admin() returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from user_profiles where user_id = auth.uid() and role = 'ADMIN');
$$;

alter table clients enable row level security;
alter table client_contacts enable row level security;
alter table locations enable row level security;
alter table equipments enable row level security;
alter table teams enable row level security;
alter table user_profiles enable row level security;
alter table rental_orders enable row level security;
alter table rental_order_equipments enable row level security;
alter table maintenance_logs enable row level security;
alter table activity_logs enable row level security;
alter table user_pins enable row level security;

create policy "authenticated_full_access" on clients for all to authenticated using (true) with check (true);
create policy "authenticated_full_access" on client_contacts for all to authenticated using (true) with check (true);
create policy "authenticated_full_access" on locations for all to authenticated using (true) with check (true);
create policy "authenticated_full_access" on equipments for all to authenticated using (true) with check (true);
create policy "authenticated_full_access" on teams for all to authenticated using (true) with check (true);
create policy "authenticated_full_access" on rental_orders for all to authenticated using (true) with check (true);
create policy "authenticated_full_access" on rental_order_equipments for all to authenticated using (true) with check (true);
create policy "authenticated_full_access" on maintenance_logs for all to authenticated using (true) with check (true);
create policy "authenticated_full_access" on activity_logs for all to authenticated using (true) with check (true);

-- user_pins만 예외: 전체 열람이 아니라 "본인 핀만" 조회/등록/삭제할 수 있어야 하므로
-- 위 authenticated_full_access(전체 CRUD)가 아닌 소유권(auth.uid() = user_id) 정책을 쓴다.
create policy "authenticated_own_rows" on user_pins for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- user_profiles도 예외: 본인 프로필은 누구나 조회할 수 있어야 하고(팀/역할 표시용),
-- 관리자(role='ADMIN')는 전체 프로필을 조회/수정(팀 배정, 승격 등)할 수 있어야 한다.
-- is_admin()은 위에서 SECURITY DEFINER로 미리 정의해 뒀다(RLS 재귀 없이 안전하게 평가하기
-- 위함). 일반 사용자는 자기 행을 INSERT/UPDATE/DELETE할 수 없다 — 신규 가입 시 행 생성은
-- handle_new_user() 트리거가 SECURITY DEFINER로 RLS를 우회해 대신 처리한다.
create policy "select_own_or_admin" on user_profiles for select to authenticated
  using (user_id = auth.uid() or is_admin());
create policy "admin_manage_all" on user_profiles for all to authenticated
  using (is_admin()) with check (is_admin());

-- anon(비로그인) 접근을 테이블 권한 수준에서 완전히 회수한다. RLS 정책도 anon용으로는
-- 하나도 두지 않으므로, 정책을 깜빡 빠뜨려 우회되는 일 없이 권한 자체가 원천 차단된다.
revoke all on clients from anon;
revoke all on client_contacts from anon;
revoke all on locations from anon;
revoke all on equipments from anon;
revoke all on teams from anon;
revoke all on user_profiles from anon;
revoke all on rental_orders from anon;
revoke all on rental_order_equipments from anon;
revoke all on maintenance_logs from anon;
revoke all on activity_logs from anon;
revoke all on user_pins from anon;

-- 신규 가입 시 user_profiles 행을 자동 생성한다. SECURITY DEFINER라 위 RLS(관리자만
-- INSERT 가능)를 우회해 실행되므로, 막 가입한 사용자 스스로도 자기 프로필 행을 만들 수
-- 있다. team_id는 미배정(NULL)으로 시작하고 role은 기본값 'MEMBER'로 시작해, 관리자가
-- 이후 설정에서 팀 배정/승격을 처리한다는 전제다.
create or replace function handle_new_user() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into user_profiles (user_id, email)
  values (new.id, new.email)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- =============================================================================
-- 4. 초기 테스트 데이터
-- =============================================================================
-- ⚠️ 아래 거래처명/현장명/담당자명/연락처/외부 차입처는 전부 포트폴리오 데모용으로
--    임의로 지어낸 가상의 값입니다. 실존하는 기업·인물과는 아무 관련이 없으며,
--    전화번호(010-0000-000X)도 실제 사용되지 않는 예시 패턴입니다.

-- 4.2 거래처 (발주/정산 업체명 — 실제 투입 현장은 rental_orders.site_name에 별도 저장)
insert into clients (id, name, last_used_at) values
    ('20000000-0000-0000-0000-000000000001', '가온산업',     now()),
    ('20000000-0000-0000-0000-000000000002', '두리기업',   now() - interval '20 days'),
    ('20000000-0000-0000-0000-000000000003', '새별이엔지', now() - interval '60 days'),
    ('20000000-0000-0000-0000-000000000004', '온빛중공업', now() - interval '5 days');

-- 4.2-1 거래처 담당자 (한 거래처에 담당자가 여러 명일 수 있음 — 예시로 가온산업에 2명 등록(가상 인물))
insert into client_contacts (client_id, contact_person, phone, last_used_at) values
    ('20000000-0000-0000-0000-000000000001', '홍길동', '010-0000-0001', now()),
    ('20000000-0000-0000-0000-000000000001', '김철수', '010-0000-0002', now() - interval '10 days'),
    ('20000000-0000-0000-0000-000000000002', '이영희', '010-0000-0003', now() - interval '20 days'),
    ('20000000-0000-0000-0000-000000000003', '박민수', '010-0000-0004', now() - interval '60 days'),
    ('20000000-0000-0000-0000-000000000004', '정다은', '010-0000-0005', now() - interval '5 days');

-- 4.3 보관 장소 — 사내 보관 위치와 실제 투입 현장(site_name)이 같은 마스터를 공유한다
-- (둘 다 "장소" 자동완성/자동학습이라는 점에서 동일한 성격이므로 테이블을 분리하지 않음).
insert into locations (id, name, last_used_at, is_site) values
    ('30000000-0000-0000-0000-000000000001', '회사', now(), false),
    ('30000000-0000-0000-0000-000000000002', '온산샵', now(), false),
    ('30000000-0000-0000-0000-000000000004', '미르화학', now(), true),
    ('30000000-0000-0000-0000-000000000005', '청람에너지파크', now() - interval '20 days', true),
    ('30000000-0000-0000-0000-000000000006', '새별이엔지 온산공장', now() - interval '60 days', true),
    ('30000000-0000-0000-0000-000000000007', '온빛중공업 거제조선소', now() - interval '5 days', true);

-- 4.4 발전기 18대 — 제조사(도요/덴요/에어맨 신형/에어맨 구형/KW/구형 발전기) 및 표준 용량
-- 6종(25/60/150/300/400/500kVA — new-equipment-dialog.tsx의 CAPACITY_PRESETS와 동일)만
-- 사용해 브랜드 필터 탭·용량(kVA) 터치 필터·자사 보유/외부 차입 뱃지를 모두 검증할 수 있게 한다.
-- 상태 구성: AVAILABLE(사내 대기·반납 복귀 포함) 10대 / RENTED(현장 가동중, 팀별 배차 전표에
-- 연결됨) 6대 / MAINTENANCE(정비중) 2대. serial_no는 제조사/용량과 무관하게 전체 발전기가 공유하는 전역
-- 번호(명판 번호)라 값이 있는 장비끼리는 전부 서로 다르다. #33(구형 발전기)은 브랜드 도장이
-- 지워져 제조사를 특정할 수 없는 노후 장비 사례다. 자사 보유 물량이 부족할 때 타 렌탈사에서
-- 잠시 빌려온 외부 차입(ownership_type='EXTERNAL') 장비 3대는 우리 쪽 명판 번호 체계에
-- 편입돼 있지 않으므로 serial_no를 NULL로 두고, 대신 external_tag(자유 식별 라벨: '늘봄 1호'
-- 등)로 화면에 구분 표시한다.
insert into equipments (
    id, maker, capacity_kva, serial_no, external_tag, status, current_location,
    last_oil_change_date, last_oil_change_hours, notes,
    ownership_type, supplier_name
) values
    ('40000000-0000-0000-0000-000000000001', '도요',        300, 1,    null, 'RENTED',      '새별이엔지 온산공장',
        '2026-06-10', 1000, null, 'OWNED', null),
    ('40000000-0000-0000-0000-000000000002', '도요',        300, 12,   null, 'RENTED',      '미르화학',
        '2026-05-20', 2200, null, 'OWNED', null),
    ('40000000-0000-0000-0000-000000000003', '덴요',        400, 47,   null, 'MAINTENANCE', '회사',
        '2026-05-01', 2800, '아워미터 초과 - 정밀 점검 필요', 'OWNED', null),
    ('40000000-0000-0000-0000-000000000004', '에어맨 신형', 500, 88,   null, 'AVAILABLE',   '온산샵',
        '2026-07-05', 860,  null, 'OWNED', null),
    ('40000000-0000-0000-0000-000000000005', 'KW',          150, 203,  null, 'AVAILABLE',   '회사',
        null,         null, '신규 도입', 'OWNED', null),
    ('40000000-0000-0000-0000-000000000006', '에어맨 구형', 60,  450,  null, 'AVAILABLE',   '회사',
        '2026-07-14', 860,  null, 'OWNED', null),
    ('40000000-0000-0000-0000-000000000007', '덴요',        60,  5,    null, 'AVAILABLE',   '회사',
        null,         null, '신규 도입', 'OWNED', null),
    ('40000000-0000-0000-0000-000000000008', '도요',        60,  8,    null, 'AVAILABLE',   '온산샵',
        '2026-06-25', 50,   null, 'OWNED', null),
    ('40000000-0000-0000-0000-000000000009', '에어맨 신형', 300, 19,   null, 'RENTED',      '청람에너지파크',
        '2026-08-01', 450,  null, 'OWNED', null),
    ('40000000-0000-0000-0000-000000000010', 'KW',          400, 26,   null, 'RENTED',      '온빛중공업 거제조선소',
        '2026-07-20', 1800, null, 'OWNED', null),
    ('40000000-0000-0000-0000-000000000011', '구형 발전기', 25,  33,   null, 'MAINTENANCE', '회사',
        '2026-05-15', 3400, '브랜드 도장 마모로 제조사 확인 불가 - 노후장비, 아워미터 과다로 정밀 점검중', 'OWNED', null),
    ('40000000-0000-0000-0000-000000000012', '도요',        150, 41,   null, 'AVAILABLE',   '온산샵',
        '2026-07-10', 290,  null, 'OWNED', null),
    ('40000000-0000-0000-0000-000000000013', '덴요',        500, 56,   null, 'AVAILABLE',   '회사',
        null,         null, null, 'OWNED', null),
    ('40000000-0000-0000-0000-000000000014', '에어맨 구형', 60,  64,   null, 'AVAILABLE',   '온산샵',
        '2026-06-01', 620,  null, 'OWNED', null),
    ('40000000-0000-0000-0000-000000000015', 'KW',          300, 77,   null, 'RENTED',      '온빛중공업 거제조선소',
        '2026-08-10', 1150, null, 'OWNED', null),
    ('40000000-0000-0000-0000-000000000016', '도요',        300, null, '늘봄 1호', 'AVAILABLE', '회사',
        null,         null, '월말 반환 예정', 'EXTERNAL', '늘봄렌탈'),
    ('40000000-0000-0000-0000-000000000017', '덴요',        400, null, '하늘 A',  'RENTED',    '온빛중공업 거제조선소',
        null,         null, null, 'EXTERNAL', '하늘장비'),
    ('40000000-0000-0000-0000-000000000018', '에어맨 신형', 150, null, '늘봄 2호', 'AVAILABLE', '온산샵',
        null,         null, '차입 계약기간 9/1~9/30', 'EXTERNAL', '늘봄렌탈');

-- 4.5 팀 마스터
insert into teams (id, name) values
    ('70000000-0000-0000-0000-000000000001', '관리팀'),
    ('70000000-0000-0000-0000-000000000002', '1팀'),
    ('70000000-0000-0000-0000-000000000003', '2팀');

-- 4.5-1 기존(이미 가입된) 계정에 대한 user_profiles 백필 — handle_new_user() 트리거는
-- auth.users에 새로 INSERT되는 계정에만 반응하므로, 이 스키마를 적용하기 전부터
-- Supabase Dashboard에서 만들어 둔 계정(개발자 본인 등)은 트리거 대상이 아니다.
-- 그런 계정이 스키마 재실행 후에도 곧바로 화면을 쓸 수 있도록, 이미 존재하는
-- auth.users 전원을 관리팀 소속 ADMIN으로 미리 만들어 둔다(운영 전환 시에는 이
-- 블록을 지우고 설정에서 개별적으로 배정하면 된다).
insert into user_profiles (user_id, email, team_id, role)
select id, email, '70000000-0000-0000-0000-000000000001', 'ADMIN'
from auth.users
on conflict (user_id) do nothing;

-- 4.6 배차 전표 8건 — ACTIVE(현장 가동중) 5건 + COMPLETED(반입 완료) 3건. 예약/사전 반입/
-- 시간 단위 같은 옛 라이프사이클은 걷어냈으므로, 모든 전표는 "등록 즉시 배차 확정" 상태로
-- 시작한다(register_dispatch를 직접 호출한 결과와 동일한 최종 상태를 데이터로 미리 넣어둔다).

-- (1) ACTIVE — 1팀 배차, 발전기 1대 + CO2 용접기 3대.
insert into rental_orders (id, order_number, client_id, client_name, site_name, team_id, dispatch_date, return_date, tig_count, co2_count, status, notes) values
    ('60000000-0000-0000-0000-000000000001', 'R-20260820-001', '20000000-0000-0000-0000-000000000001', '가온산업', '미르화학',
     '70000000-0000-0000-0000-000000000002', '2026-08-20', null, 0, 3, 'ACTIVE', '미르화학 공사현장 출고');

insert into rental_order_equipments (order_id, equipment_id) values
    ('60000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002');

-- (2) ACTIVE — 2팀 배차, 발전기 1대 + 티그 용접기 2대. 반입 예정일이 미리 잡혀 있는 케이스.
insert into rental_orders (id, order_number, client_id, client_name, site_name, team_id, dispatch_date, return_date, tig_count, co2_count, status, notes) values
    ('60000000-0000-0000-0000-000000000002', 'R-20260901-002', '20000000-0000-0000-0000-000000000002', '두리기업', '청람에너지파크',
     '70000000-0000-0000-0000-000000000003', '2026-09-01', '2026-09-05', 2, 0, 'ACTIVE', '반입 예정일 9/5로 사전 협의');

insert into rental_order_equipments (order_id, equipment_id) values
    ('60000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000009');

-- (3) ACTIVE — 1팀 배차, 자사 보유(KW350) + 외부 차입(덴요450, 하늘장비) 발전기가 같은
-- 전표에 함께 나간 케이스. 대시보드에서 외부 차입 뱃지가 자사 장비와 나란히 보이는지 검증한다.
insert into rental_orders (id, order_number, client_id, client_name, site_name, team_id, dispatch_date, return_date, tig_count, co2_count, status, notes) values
    ('60000000-0000-0000-0000-000000000003', 'R-20260825-003', '20000000-0000-0000-0000-000000000004', '온빛중공업', '온빛중공업 거제조선소',
     '70000000-0000-0000-0000-000000000002', '2026-08-25', null, 0, 2, 'ACTIVE', '조선소 정기 도크 작업 - 자사 KW350 + 차입 덴요450 동시 출고');

insert into rental_order_equipments (order_id, equipment_id) values
    ('60000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000015'),
    ('60000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000017');

-- (4) ACTIVE — 2팀 배차, 오늘(2026-09-02) 막 나간 발전기 1대 + 티그 용접기 1대.
insert into rental_orders (id, order_number, client_id, client_name, site_name, team_id, dispatch_date, return_date, tig_count, co2_count, status, notes) values
    ('60000000-0000-0000-0000-000000000004', 'R-20260902-004', '20000000-0000-0000-0000-000000000003', '새별이엔지', '새별이엔지 온산공장',
     '70000000-0000-0000-0000-000000000003', '2026-09-02', null, 1, 0, 'ACTIVE', '당일 배차');

insert into rental_order_equipments (order_id, equipment_id) values
    ('60000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000001');

-- (5) ACTIVE — 팀 미배정(team_id NULL) 케이스 + 발전기 1대 + CO2 용접기 1대, 반입 예정일 포함.
insert into rental_orders (id, order_number, client_id, client_name, site_name, team_id, dispatch_date, return_date, tig_count, co2_count, status, notes) values
    ('60000000-0000-0000-0000-000000000005', 'R-20260828-005', '20000000-0000-0000-0000-000000000004', '온빛중공업', '온빛중공업 거제조선소',
     null, '2026-08-28', '2026-09-10', 0, 1, 'ACTIVE', '팀 미배정 - 추후 배정 필요');

insert into rental_order_equipments (order_id, equipment_id) values
    ('60000000-0000-0000-0000-000000000005', '40000000-0000-0000-0000-000000000010');

-- (6) COMPLETED — 이번 달(9월) 반입 완료 건.
insert into rental_orders (id, order_number, client_id, client_name, site_name, team_id, dispatch_date, return_date, tig_count, co2_count, status, notes) values
    ('60000000-0000-0000-0000-000000000006', 'R-20260815-006', '20000000-0000-0000-0000-000000000002', '두리기업', '청람에너지파크',
     '70000000-0000-0000-0000-000000000003', '2026-08-15', '2026-09-01', 0, 1, 'COMPLETED', '청람에너지파크 정기보수 지원 - 반입 완료');

insert into rental_order_equipments (order_id, equipment_id) values
    ('60000000-0000-0000-0000-000000000006', '40000000-0000-0000-0000-000000000006');

-- (7) COMPLETED — 지난 달(8월) 반입 완료 건.
insert into rental_orders (id, order_number, client_id, client_name, site_name, team_id, dispatch_date, return_date, tig_count, co2_count, status, notes) values
    ('60000000-0000-0000-0000-000000000007', 'R-20260720-007', '20000000-0000-0000-0000-000000000001', '가온산업', '미르화학',
     '70000000-0000-0000-0000-000000000002', '2026-07-20', '2026-08-04', 2, 0, 'COMPLETED', '미르화학 배관 교체 지원 - 반입 완료');

insert into rental_order_equipments (order_id, equipment_id) values
    ('60000000-0000-0000-0000-000000000007', '40000000-0000-0000-0000-000000000012');

-- (8) COMPLETED — 용접기 없이 발전기만 나갔다 들어온 단순 케이스.
insert into rental_orders (id, order_number, client_id, client_name, site_name, team_id, dispatch_date, return_date, tig_count, co2_count, status, notes) values
    ('60000000-0000-0000-0000-000000000008', 'R-20260701-008', '20000000-0000-0000-0000-000000000003', '새별이엔지', '새별이엔지 온산공장',
     '70000000-0000-0000-0000-000000000002', '2026-07-01', '2026-07-19', 0, 0, 'COMPLETED', '새별이엔지 온산공장 배관 보수 지원 - 반입 완료');

insert into rental_order_equipments (order_id, equipment_id) values
    ('60000000-0000-0000-0000-000000000008', '40000000-0000-0000-0000-000000000008');

-- 4.7 정비 이력 (발전기 전용)
-- 덴요 400(47번)과 구형 발전기(33번)는 아워미터 초과로 현재 MAINTENANCE 상태로 입고된 상태 —
-- 아직 점검 완료 처리 전이므로 START 로그만 남아 있다.
insert into maintenance_logs (equipment_id, service_date, service_type, service_hours, notes, user_email, log_type) values
    ('40000000-0000-0000-0000-000000000001', '2026-06-10', '오일/필터 교환', 1000, '정기 교환', 'admin@example.com', 'COMPLETE'),
    ('40000000-0000-0000-0000-000000000002', '2026-05-20', '오일/필터 교환', 2200, '정기 교환', 'admin@example.com', 'COMPLETE'),
    ('40000000-0000-0000-0000-000000000003', '2026-05-01', '오일/필터 교환', 2800, '정기 교환', 'admin@example.com', 'COMPLETE'),
    ('40000000-0000-0000-0000-000000000004', '2026-07-05', '오일/필터 교환', 860,  '정기 교환', 'admin@example.com', 'COMPLETE'),
    ('40000000-0000-0000-0000-000000000006', '2026-07-14', '오일/필터 교환', 860,  '정기 교환', 'admin@example.com', 'COMPLETE'),
    ('40000000-0000-0000-0000-000000000008', '2026-06-25', '오일/필터 교환', 50,   '정기 교환', 'admin@example.com', 'COMPLETE'),
    ('40000000-0000-0000-0000-000000000009', '2026-08-01', '오일/필터 교환', 450,  '정기 교환', 'admin@example.com', 'COMPLETE'),
    ('40000000-0000-0000-0000-000000000010', '2026-07-20', '오일/필터 교환', 1800, '정기 교환', 'admin@example.com', 'COMPLETE'),
    ('40000000-0000-0000-0000-000000000011', '2026-05-15', '오일/필터 교환', 3400, '정기 교환', 'admin@example.com', 'COMPLETE'),
    ('40000000-0000-0000-0000-000000000012', '2026-07-10', '오일/필터 교환', 290,  '정기 교환', 'admin@example.com', 'COMPLETE'),
    ('40000000-0000-0000-0000-000000000014', '2026-06-01', '오일/필터 교환', 620,  '정기 교환', 'admin@example.com', 'COMPLETE'),
    ('40000000-0000-0000-0000-000000000015', '2026-08-10', '오일/필터 교환', 1150, '정기 교환', 'admin@example.com', 'COMPLETE'),
    ('40000000-0000-0000-0000-000000000003', '2026-08-20', '점검/수리 입고', 3120, '아워미터 초과(3120h) - 정밀 점검 필요', 'admin@example.com', 'START'),
    ('40000000-0000-0000-0000-000000000011', '2026-08-25', '점검/수리 입고', 3400, '브랜드 도장 마모로 제조사 확인 불가 - 노후장비, 아워미터 초과(3400h) - 정밀 점검 필요', 'admin@example.com', 'START');

-- 4.8 감사 로그 예시
insert into activity_logs (user_email, action, target_type, target_id, description) values
    ('admin@example.com', 'DISPATCH', 'ORDER', '60000000-0000-0000-0000-000000000001', 'R-20260820-001 배차 등록 (발전기 1대, CO2 용접기 3대)'),
    ('admin@example.com', 'DISPATCH', 'ORDER', '60000000-0000-0000-0000-000000000002', 'R-20260901-002 배차 등록 (발전기 1대, 티그 용접기 2대)'),
    ('admin@example.com', 'DISPATCH', 'ORDER', '60000000-0000-0000-0000-000000000003', 'R-20260825-003 배차 등록 (자사 KW350 + 차입 덴요450, CO2 용접기 2대)'),
    ('admin@example.com', 'DISPATCH', 'ORDER', '60000000-0000-0000-0000-000000000004', 'R-20260902-004 배차 등록 (발전기 1대, 티그 용접기 1대)'),
    ('admin@example.com', 'DISPATCH', 'ORDER', '60000000-0000-0000-0000-000000000005', 'R-20260828-005 배차 등록 (발전기 1대, CO2 용접기 1대)'),
    ('admin@example.com', 'RETURN',   'ORDER', '60000000-0000-0000-0000-000000000006', 'R-20260815-006 반입 완료 처리'),
    ('admin@example.com', 'RETURN',   'ORDER', '60000000-0000-0000-0000-000000000007', 'R-20260720-007 반입 완료 처리'),
    ('admin@example.com', 'RETURN',   'ORDER', '60000000-0000-0000-0000-000000000008', 'R-20260701-008 반입 완료 처리');

-- =============================================================================
-- 5. RPC 함수 (Mutation / 비즈니스 로직)
-- =============================================================================
-- 여러 테이블에 걸친 재고·상태 변경(SPEC 3장)은 부분 실패로 재고가 어긋나면 안 되므로
-- 반드시 아래 SECURITY DEFINER 함수를 통해서만 수행한다. 함수 본문 전체가 단일
-- 트랜잭션으로 실행되고(Postgres 함수는 기본적으로 원자적), SECURITY DEFINER로
-- RLS를 우회해 실행된다. 로그인 도입 이후에도 테이블 직접 INSERT/UPDATE/DELETE 권한은
-- 주지 않고 "정해진 절차(이 RPC들)로만 상태를 바꾼다"는 구조를 유지하며, 이 RPC 실행
-- 권한 자체도 authenticated(로그인한 사용자)에게만 부여한다 — 아래 5.24 참고.

-- 0. 이 섹션에서 만드는 함수들을 이름 기준으로 전부 삭제한 뒤 새로 만든다.
-- `create or replace function`은 같은 이름이라도 매개변수 구성이 다르면 새 오버로드로
-- 추가될 뿐 이전 버전을 지우지 않는다 — 이 파일을 여러 번 재실행하며 함수 시그니처를
-- 바꿔온 경우, 옛 오버로드가 남아 PostgREST가 "어떤 함수인지 특정할 수 없음" 오류를
-- 낸다. DROP TABLE과 달리 함수는 테이블에 종속되지 않아 위 CASCADE로도 안 지워지므로,
-- 여기서 매 실행마다 명시적으로 정리한다.
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'find_or_create_client',
        'find_or_create_client_contact',
        'touch_location',
        'equipment_label',
        'return_external_equipment',
        'register_dispatch',
        'complete_dispatch_return',
        'cancel_dispatch',
        'set_equipment_location',
        'register_oil_change',
        'complete_equipment_maintenance',
        'create_equipment',
        'discard_equipment',
        'update_equipment_info',
        'start_equipment_maintenance',
        'update_client',
        'create_client',
        'update_location',
        'create_location',
        'restore_equipment',
        'hard_delete_equipment'
      )
  loop
    execute format('drop function if exists %s', r.sig);
  end loop;
end $$;

-- 5.1 거래처 자동 학습 + upsert (SPEC 3-1)
create or replace function find_or_create_client(p_name text) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
begin
  select id into v_client_id from clients where name = p_name;

  if v_client_id is null then
    insert into clients (name) values (p_name) returning id into v_client_id;
  else
    update clients set last_used_at = now() where id = v_client_id;
  end if;

  return v_client_id;
end;
$$;

-- 5.1-1 거래처 담당자 자동 학습 + upsert — 한 거래처에 담당자가 여러 명일 수 있으므로
-- (client_id, contact_person, phone) 조합이 이미 있으면 재사용, 없으면 새로 추가한다.
create or replace function find_or_create_client_contact(
  p_client_id uuid,
  p_contact_person text,
  p_phone text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact_id uuid;
begin
  if coalesce(btrim(p_contact_person), '') = '' then
    return null;
  end if;

  select id into v_contact_id from client_contacts
    where client_id = p_client_id
      and contact_person = p_contact_person
      and coalesce(phone, '') = coalesce(p_phone, '');

  if v_contact_id is null then
    insert into client_contacts (client_id, contact_person, phone)
    values (p_client_id, p_contact_person, p_phone)
    returning id into v_contact_id;
  else
    update client_contacts set last_used_at = now() where id = v_contact_id;
  end if;

  return v_contact_id;
end;
$$;

-- 5.2 보관 장소 자동 학습 (SPEC 3-1) — current_location/return_location은 FK가 아닌
-- 자유 입력 TEXT이므로, 다음 번 드롭다운 제안을 위해 locations 마스터만 upsert한다.
-- p_is_site: 신규 등록 시에만 사내 위치(false)/외부 현장(true) 분류를 붙인다 — 이미 있는
-- 장소면 last_used_at만 갱신하고 기존 분류는 그대로 둔다(호출 맥락에 따라 흔들리지 않도록).
create or replace function touch_location(p_name text, p_is_site boolean default false) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_name is null or btrim(p_name) = '' then
    return;
  end if;

  insert into locations (name, last_used_at, is_site)
  values (p_name, now(), p_is_site)
  on conflict (name) do update set last_used_at = now();
end;
$$;

-- 5.2-1 발전기 표시 라벨 — activity_logs/오류 메시지 전반에서 재사용하는 공용 포맷터.
-- serial_no가 있으면 기존과 동일하게 "{제조사} {용량}kVA {번호}번"으로 표시하고,
-- 외부 차입 장비처럼 번호가 없으면 "번호 미부여"로 대체해 "kVA 번"처럼 번호가 빠진
-- 어색한 문구가 남지 않게 한다(화면(TS)의 formatGeneratorLabel과는 별개 — 그쪽은
-- 차입처/식별 라벨까지 붙이는 더 풍부한 포맷이고, 이쪽은 로그/예외 메시지용 최소 포맷).
create or replace function equipment_label(p_maker text, p_capacity_kva int, p_serial_no int) returns text
language sql
immutable
as $$
  select case
    when p_serial_no is not null then format('%s %skVA %s번', p_maker, p_capacity_kva, p_serial_no)
    else format('%s %skVA (번호 미부여)', p_maker, p_capacity_kva)
  end;
$$;

-- 5.3 대여 등록 — 간소화된 단일 대여 모델. "예약 저장" 없이 등록하는 순간 이미 확정된
-- 대여라 곧바로 rental_orders.status='ACTIVE'로 시작하고, 선택된 발전기는 즉시
-- equipments.status='RENTED' / current_location=투입 현장으로 갱신한다. 용접기(티그/CO2)는
-- 개별 자산 추적을 걷어내고 전표에 딸린 수량(tig_count/co2_count)으로만 남긴다.
-- p_equipment_ids: 발전기 uuid 배열 (빈 배열 가능 — 대신 용접기 수량이 있어야 함).
-- 현장 직송 허용: 이미 다른 현장에 RENTED 상태로 나가 있는 발전기라도(현장→현장 직행)
-- 예외 없이 그대로 새 현장으로 인계할 수 있다 — 장비별 겹침/충돌 검사는 의도적으로
-- 두지 않는다(실무 판단에 맡기는 간소화). 대신 아래에서 "이전 전표를 어떻게 정리할지"는
-- 자동으로 처리한다(현장 직송 스윙 가드, 5.3-1 주석 참고).
-- 거래처 담당자/연락처(find_or_create_client_contact)는 이 화면에서 더 이상 입력받지
-- 않으므로 파라미터에서 걷어냈다 — 거래처 담당자 등록은 설정 > 거래처 관리 화면의
-- create_client가 전담한다.
create or replace function register_dispatch(
  p_site_name text,
  p_client_name text,
  p_equipment_ids uuid[],
  p_tig_count int,
  p_co2_count int,
  p_notes text,
  p_user_email text,
  p_dispatch_date date default current_date,
  p_return_date date default null,
  p_team_id uuid default null,
  p_swung_welders jsonb default '[]'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
  v_order_id uuid;
  v_order_number text;
  v_equipment_id uuid;
  v_equipment_count int := coalesce(array_length(p_equipment_ids, 1), 0);
  v_team_id uuid := p_team_id;
  v_dispatch_date date := coalesce(p_dispatch_date, current_date);
  v_old_order_id uuid;
  v_old_order rental_orders%rowtype;
  v_old_total_count int;
  v_swung_count int;
  v_swung_tig int;
  v_swung_co2 int;
  v_remaining_tig int;
  v_remaining_co2 int;
  v_note text;
  v_equipment_status text;
  v_equipment_name text;
begin
  if coalesce(btrim(p_site_name), '') = '' then
    raise exception '투입 현장을 입력해 주세요';
  end if;
  if coalesce(btrim(p_client_name), '') = '' then
    raise exception '발주 업체명을 입력해 주세요';
  end if;
  if v_equipment_count = 0 and coalesce(p_tig_count, 0) <= 0 and coalesce(p_co2_count, 0) <= 0 then
    raise exception '발전기 또는 용접기를 최소 1개 이상 선택해 주세요';
  end if;

  -- p_team_id를 명시적으로 넘기지 않았다면(화면에 별도 팀 선택 UI가 없다),
  -- 지금 로그인한 계정 본인의 소속 팀으로 자동 배정한다. 소속 팀이 없는
  -- 계정(관리자 등)이면 team_id는 그대로 NULL(미배정)로 남는다.
  if v_team_id is null then
    select team_id into v_team_id from user_profiles where user_id = auth.uid();
  end if;

  v_client_id := find_or_create_client(p_client_name);
  perform touch_location(p_site_name, true);

  v_order_number := 'R-' || to_char(now() at time zone 'Asia/Seoul', 'YYYYMMDD')
    || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  insert into rental_orders (
    order_number, client_id, client_name, site_name, team_id,
    dispatch_date, return_date, tig_count, co2_count, status, notes
  )
  values (
    v_order_number, v_client_id, p_client_name, p_site_name, v_team_id,
    v_dispatch_date, p_return_date, coalesce(p_tig_count, 0), coalesce(p_co2_count, 0),
    'ACTIVE', p_notes
  )
  returning id into v_order_id;

  -- 5.3-1 현장 직송(스윙) 가드 — 이번에 배정하려는 발전기 중 이미 다른 ACTIVE 전표에
  -- 걸려 있는 장비가 있으면, 그 이전 전표를 방치하지 않고 정리한다. for update로
  -- 잠가 동시에 같은 이전 전표를 스윙 처리하는 경합을 막는다. p_swung_welders는 화면의
  -- 수량 지정 스텝퍼로 얼마나 가져올지 명시한 것으로, [{"order_id":...,"tig_count":n,
  -- "co2_count":m}] 형태다 — 이전 전표의 잔여 수량 중 지정한 만큼만 정확히 차감한다
  -- (부분 이관 지원, 전량 강제 아님).
  for v_old_order_id in
    select distinct roe.order_id
    from rental_order_equipments roe
    join rental_orders ro on ro.id = roe.order_id
    where roe.equipment_id = any(coalesce(p_equipment_ids, '{}')) and ro.status = 'ACTIVE'
  loop
    select * into v_old_order from rental_orders where id = v_old_order_id for update;

    -- 이번 대여로 이전 전표에서 빠져나가는 장비 수 / 이전 전표에 원래 걸려 있던 전체 장비 수.
    select count(*) into v_swung_count
      from rental_order_equipments
      where order_id = v_old_order_id and equipment_id = any(p_equipment_ids);
    select count(*) into v_old_total_count
      from rental_order_equipments where order_id = v_old_order_id;

    -- p_swung_welders 배열에서 이 전표(order_id)에 해당하는 이관 수량을 찾는다.
    -- 해당 항목이 없으면 max()가 NULL을 반환하므로 coalesce로 0 처리한다.
    select coalesce(max((elem->>'tig_count')::int), 0), coalesce(max((elem->>'co2_count')::int), 0)
      into v_swung_tig, v_swung_co2
      from jsonb_array_elements(coalesce(p_swung_welders, '[]'::jsonb)) elem
      where elem->>'order_id' = v_old_order_id::text;

    v_remaining_tig := greatest(v_old_order.tig_count - v_swung_tig, 0);
    v_remaining_co2 := greatest(v_old_order.co2_count - v_swung_co2, 0);

    if v_old_total_count - v_swung_count = 0 and v_remaining_tig = 0 and v_remaining_co2 = 0 then
      -- 발전기와 용접기 모두 이전 전표에 남는 게 없다면, 이전 전표를 그대로 현장 반출
      -- 완료 처리한다 — rental_order_equipments 행은 지우지 않는다(return_date가
      -- 채워지면서 그 자체로 "이 시점까지의 이력"이 되어 계산에 정확히 반영된다).
      update rental_orders
        set status = 'COMPLETED',
            return_date = v_dispatch_date,
            tig_count = v_remaining_tig,
            co2_count = v_remaining_co2,
            notes = coalesce(notes || E'\n', '') || format('[발전기 및 용접기 전량 직송 반출 -> %s]', p_site_name)
        where id = v_old_order_id;
    else
      -- 발전기가 남아있거나 용접기가 일부라도 남아있다면 전표는 ACTIVE로 유지하되,
      -- 이번에 빠져나가는 장비의 연결만 끊는다 — 안 그러면 그 장비가 새 전표와 이전
      -- 전표 양쪽에 동시에 "아직 가동중"으로 남아 이력 캘린더가 꼬인다.
      delete from rental_order_equipments
        where order_id = v_old_order_id and equipment_id = any(p_equipment_ids);

      update rental_orders
        set tig_count = v_remaining_tig,
            co2_count = v_remaining_co2,
            notes = coalesce(notes || E'\n', '')
              || format('[일부 장비/용접기 직송 반출(TIG %s대, CO2 %s대) -> %s]', v_swung_tig, v_swung_co2, p_site_name)
        where id = v_old_order_id;
    end if;
  end loop;

  -- 동시성 가드: for update로 행을 잠가 동시에 같은 장비를 서로 다른 전표에 배정하는
  -- 경합을 직렬화하고, 잠근 시점의 최신 상태를 기준으로 정비중(MAINTENANCE) 장비는
  -- 배정을 차단한다 — 화면의 배정 시점 체크는 다이얼로그를 연 순간의 스냅샷이라
  -- 그 사이 다른 사용자가 정비 입고 처리를 하면 무력화될 수 있으므로, 실제 반영은
  -- 반드시 여기서(제출 시점 최신 상태로) 최종 확정한다.
  foreach v_equipment_id in array coalesce(p_equipment_ids, '{}')
  loop
    select status, equipment_label(maker, capacity_kva, serial_no)
      into v_equipment_status, v_equipment_name
      from equipments where id = v_equipment_id for update;

    if v_equipment_name is null then
      raise exception '존재하지 않는 장비입니다: %', v_equipment_id;
    end if;
    if v_equipment_status = 'MAINTENANCE' then
      raise exception '정비중인 장비는 배정할 수 없습니다: %', v_equipment_name;
    end if;

    insert into rental_order_equipments (order_id, equipment_id) values (v_order_id, v_equipment_id);

    update equipments set status = 'RENTED', current_location = p_site_name where id = v_equipment_id;
  end loop;

  insert into activity_logs (user_email, action, target_type, target_id, description)
  values (
    p_user_email, 'DISPATCH', 'ORDER', v_order_id,
    v_order_number || ' 대여 등록 (발전기 ' || v_equipment_count || '대, 티그 ' || coalesce(p_tig_count, 0)
      || '대, CO2 ' || coalesce(p_co2_count, 0) || '대)'
  );

  return v_order_id;
end;
$$;

-- 5.4 현장 반출 처리 — 대여 전표를 통째로 완료 처리한다. 연결된 발전기 전부를 사내(또는
-- 지정한 반출 장소)로 복귀시키고 전표 상태를 COMPLETED로 바꾼다. 개별 장비만 부분
-- 반출하는 시나리오는 이 간소화 모델에서 지원하지 않는다 — 필요하면 장비 상세 모달에서
-- 개별 장비의 위치/상태를 직접 조정한다.
-- 현장 직송 가드: register_dispatch가 이 발전기를 이미 다른(새) 전표로 스윙시켰다면
-- current_location은 그 새 현장으로 갱신되어 있다 — 이 오래된 전표를 뒤늦게 반출 처리
-- 하더라도 current_location이 지금도 "이 전표의 site_name"인 장비만 골라 되돌려야
-- 새 현장에 가 있는 장비를 엉뚱하게 "회사"로 덮어쓰는 사고를 막을 수 있다.
create or replace function complete_dispatch_return(
  p_order_id uuid,
  p_user_email text,
  p_actual_return_date date default current_date,
  p_return_location text default '회사'
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order rental_orders%rowtype;
  v_return_location text := coalesce(nullif(btrim(p_return_location), ''), '회사');
  v_return_date date := coalesce(p_actual_return_date, current_date);
  v_equipment_id uuid;
begin
  select * into v_order from rental_orders where id = p_order_id for update;
  if v_order.id is null then
    raise exception '대여 전표를 찾을 수 없습니다: %', p_order_id;
  end if;
  if v_order.status <> 'ACTIVE' then
    raise exception '이미 현장 반출 처리된 전표입니다';
  end if;

  update rental_orders set status = 'COMPLETED', return_date = v_return_date where id = p_order_id;

  for v_equipment_id in select equipment_id from rental_order_equipments where order_id = p_order_id and equipment_id is not null
  loop
    update equipments
      set status = 'AVAILABLE', current_location = v_return_location
      where id = v_equipment_id and current_location = v_order.site_name;
  end loop;

  perform touch_location(v_return_location, false);

  insert into activity_logs (user_email, action, target_type, target_id, description)
  values (p_user_email, 'RETURN', 'ORDER', p_order_id, v_order.order_number || ' 현장 반출 처리 (' || v_return_location || ')');
end;
$$;

-- 5.4-1 배차 취소(오입력 대응) — 시스템 간소화 모델에는 CANCELLED 상태가 없으므로
-- "취소"는 곧 그 전표가 아예 없었던 것으로 되돌리는 것이다. ACTIVE 상태에서만
-- 허용하며(COMPLETED는 이미 반입 완료된 실적이라 취소 대상이 아니다), 배정됐던
-- 발전기 전부를 사내(회사)로 즉시 복귀시킨 뒤 전표/연결 데이터를 완전히 삭제한다.
-- activity_logs.target_id는 FK가 아닌 순수 참조용 UUID라 전표 삭제 후에도
-- 로그 자체는 그대로 남는다.
create or replace function cancel_dispatch(
  p_order_id uuid,
  p_user_email text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order rental_orders%rowtype;
  v_equipment_id uuid;
begin
  select * into v_order from rental_orders where id = p_order_id for update;
  if v_order.id is null then
    raise exception '배차 전표를 찾을 수 없습니다: %', p_order_id;
  end if;
  if v_order.status <> 'ACTIVE' then
    raise exception '가동중(ACTIVE)인 배차만 취소할 수 있습니다';
  end if;

  for v_equipment_id in select equipment_id from rental_order_equipments where order_id = p_order_id and equipment_id is not null
  loop
    update equipments set status = 'AVAILABLE', current_location = '회사' where id = v_equipment_id;
  end loop;

  insert into activity_logs (user_email, action, target_type, target_id, description)
  values (p_user_email, 'DELETE', 'ORDER', p_order_id, v_order.order_number || ' 배차 취소(오입력) - 발전기 ' || v_order.site_name || ' → 회사 원복');

  delete from rental_order_equipments where order_id = p_order_id;
  delete from rental_orders where id = p_order_id;
end;
$$;

-- 5.5 장비 보관 위치 변경 (SPEC 4-2 상세 모달)
create or replace function set_equipment_location(
  p_equipment_id uuid,
  p_location text,
  p_user_email text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_equipment_name text;
  v_status text;
begin
  if coalesce(btrim(p_location), '') = '' then
    raise exception '보관 위치를 입력해 주세요';
  end if;

  select equipment_label(maker, capacity_kva, serial_no), status
    into v_equipment_name, v_status
    from equipments where id = p_equipment_id;
  if v_equipment_name is null then
    raise exception '존재하지 않는 장비입니다: %', p_equipment_id;
  end if;

  -- 출고중인 장비의 위치는 현장이고, 그 외(대기/점검)는 사내 위치이므로 분류에 반영한다.
  perform touch_location(p_location, v_status = 'RENTED');

  update equipments set current_location = p_location where id = p_equipment_id;

  insert into activity_logs (user_email, action, target_type, target_id, description)
  values (p_user_email, 'UPDATE', 'EQUIPMENT', p_equipment_id, v_equipment_name || ' 위치를 ' || p_location || '(으)로 변경');
end;
$$;

-- 5.6 오일/필터 교환 등록 (SPEC 4-1 발전기 상세 모달 [오일/필터 교환 등록]) — 교환 일자와
-- 교환 시점 아워미터, 메모만 입력받아 이력에 남기고 장비의 최근 교환 정보를 갱신한다.
-- 점검/수리중(MAINTENANCE)이던 장비라면 교환 등록을 완료 신호로 보고 대기(AVAILABLE)로 되돌린다.
create or replace function register_oil_change(
  p_equipment_id uuid,
  p_service_date date,
  p_service_hours int,
  p_notes text,
  p_user_email text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_equipment_name text;
  v_service_date date := coalesce(p_service_date, (now() at time zone 'Asia/Seoul')::date);
begin
  select equipment_label(maker, capacity_kva, serial_no) into v_equipment_name
    from equipments where id = p_equipment_id for update;
  if v_equipment_name is null then
    raise exception '존재하지 않는 장비입니다: %', p_equipment_id;
  end if;

  insert into maintenance_logs (equipment_id, service_date, service_type, service_hours, notes, user_email, log_type)
  values (p_equipment_id, v_service_date, '오일/필터 교환', p_service_hours, p_notes, p_user_email, 'COMPLETE');

  update equipments
    set last_oil_change_date = v_service_date,
        last_oil_change_hours = p_service_hours,
        status = case when status = 'MAINTENANCE' then 'AVAILABLE' else status end
    where id = p_equipment_id;

  insert into activity_logs (user_email, action, target_type, target_id, description)
  values (p_user_email, 'UPDATE', 'EQUIPMENT', p_equipment_id, v_equipment_name || ' 오일/필터 교환 등록');
end;
$$;

-- 5.6-1 점검 완료 (SPEC 4-1 발전기 상세 모달 [점검 완료]) — 오일/필터 교환 없이도
-- 점검/수리중(MAINTENANCE)인 장비를 대기(AVAILABLE)로 되돌릴 수 있어야 한다. 수리만
-- 하고 오일/필터는 교환하지 않은 경우까지 register_oil_change를 억지로 거치게
-- 만들 이유가 없어 별도 함수로 둔다.
create or replace function complete_equipment_maintenance(
  p_equipment_id uuid,
  p_notes text,
  p_user_email text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_equipment_name text;
  v_status text;
begin
  select equipment_label(maker, capacity_kva, serial_no), status
    into v_equipment_name, v_status
    from equipments where id = p_equipment_id for update;
  if v_equipment_name is null then
    raise exception '존재하지 않는 장비입니다: %', p_equipment_id;
  end if;
  if v_status <> 'MAINTENANCE' then
    raise exception '점검/수리중인 장비만 점검 완료 처리할 수 있습니다';
  end if;

  update equipments set status = 'AVAILABLE' where id = p_equipment_id;

  insert into maintenance_logs (equipment_id, service_date, service_type, notes, user_email, log_type)
  values (p_equipment_id, (now() at time zone 'Asia/Seoul')::date, '점검 완료', p_notes, p_user_email, 'COMPLETE');

  insert into activity_logs (user_email, action, target_type, target_id, description)
  values (p_user_email, 'UPDATE', 'EQUIPMENT', p_equipment_id, v_equipment_name || ' 점검 완료 (대기 전환)');
end;
$$;

-- 5.7 신규 발전기 등록 (SPEC 4-2 [+ 새 장비 등록])
-- p_serial_no는 이제 선택 입력이다 — 자사 보유(OWNED) 장비는 여전히 명판 번호가
-- 필수지만, 외부 차입(EXTERNAL) 장비는 우리 번호 체계에 편입돼 있지 않은 경우가
-- 많아 생략을 허용하고 p_external_tag(자유 식별 라벨)로 대신 구분한다.
create or replace function create_equipment(
  p_maker text,
  p_capacity_kva int,
  p_current_location text,
  p_notes text,
  p_user_email text,
  p_serial_no int default null,
  p_ownership_type text default 'OWNED',
  p_supplier_name text default null,
  p_external_tag text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_equipment_id uuid;
  v_label text;
  v_ownership_type text := coalesce(nullif(btrim(p_ownership_type), ''), 'OWNED');
begin
  if coalesce(btrim(p_maker), '') = '' then
    raise exception '제조사를 입력해 주세요';
  end if;
  if p_capacity_kva is null or p_capacity_kva <= 0 then
    raise exception '용량(kVA)을 입력해 주세요';
  end if;
  if v_ownership_type not in ('OWNED', 'EXTERNAL') then
    raise exception '알 수 없는 소유 구분입니다: %', v_ownership_type;
  end if;
  -- 외부 차입(전대) 장비는 어느 렌탈사에서 빌려온 건지 상호를 반드시 남겨야
  -- 반납/정산 시점에 원 소유주를 추적할 수 있다.
  if v_ownership_type = 'EXTERNAL' and coalesce(btrim(p_supplier_name), '') = '' then
    raise exception '외부 차입 장비는 차입처 상호를 입력해 주세요';
  end if;
  -- 자사 보유 장비는 명판 번호가 필수다. 외부 차입 장비는 번호를 생략할 수 있다.
  if v_ownership_type = 'OWNED' and (p_serial_no is null or p_serial_no <= 0) then
    raise exception '번호를 입력해 주세요';
  end if;
  if p_serial_no is not null then
    if p_serial_no <= 0 then
      raise exception '번호를 입력해 주세요';
    end if;
    -- 번호 유일성은 현재 활성(폐기되지 않은) 장비 범위에서만 검사한다 — 폐기된
    -- 장비의 번호는 신규 등록에 다시 쓸 수 있다.
    if exists (select 1 from equipments where serial_no = p_serial_no and is_deleted = false) then
      raise exception '이미 사용중인 번호입니다: %', p_serial_no;
    end if;
  end if;

  insert into equipments (
    maker, capacity_kva, serial_no, external_tag, current_location, notes,
    ownership_type, supplier_name
  )
  values (
    p_maker,
    p_capacity_kva,
    p_serial_no,
    nullif(btrim(p_external_tag), ''),
    coalesce(nullif(btrim(p_current_location), ''), '회사'),
    p_notes,
    v_ownership_type,
    case when v_ownership_type = 'EXTERNAL' then nullif(btrim(p_supplier_name), '') else null end
  )
  returning id into v_equipment_id;

  perform touch_location(p_current_location, false);

  v_label := equipment_label(p_maker, p_capacity_kva, p_serial_no);
  insert into activity_logs (user_email, action, target_type, target_id, description)
  values (
    p_user_email, 'CREATE', 'EQUIPMENT', v_equipment_id,
    v_label || ' 신규 등록' || case when v_ownership_type = 'EXTERNAL' then format(' (외부 차입: %s)', p_supplier_name) else '' end
  );

  return v_equipment_id;
end;
$$;

-- 5.8 장비 폐기/매각 (Soft Delete, SPEC 4-2 [장비 폐기/매각])
create or replace function discard_equipment(p_equipment_id uuid, p_user_email text) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_equipment_name text;
  v_status text;
begin
  select equipment_label(maker, capacity_kva, serial_no), status
    into v_equipment_name, v_status
    from equipments where id = p_equipment_id for update;
  if v_equipment_name is null then
    raise exception '존재하지 않는 장비입니다: %', p_equipment_id;
  end if;
  if v_status = 'RENTED' then
    raise exception '출고중인 장비는 폐기할 수 없습니다. 먼저 반납 처리해 주세요';
  end if;

  update equipments set is_deleted = true, deleted_at = now() where id = p_equipment_id;

  -- 폐기된 장비를 계속 "핀 고정"해 둘 이유가 없으므로 잔재 데이터를 바로 정리한다.
  -- (restore_equipment로 복구해도 핀은 되살아나지 않으며, 필요하면 다시 고정하면 된다.)
  delete from user_pins where target_type = 'equipment' and target_id = p_equipment_id::text;

  insert into activity_logs (user_email, action, target_type, target_id, description)
  values (p_user_email, 'DELETE', 'EQUIPMENT', p_equipment_id, v_equipment_name || ' 폐기/매각 처리');
end;
$$;

-- 5.8-1 협력사 반환 (외부 차입 전용, SPEC 4-2 상세 모달 [협력사 반환]) — 자사 자산이 아닌
-- 외부 차입(EXTERNAL) 장비를 원 소유주(차입처)에게 돌려보낼 때 쓴다. discard_equipment
-- (자사 장비 폐기/매각)와 의미는 다르지만, "더 이상 우리 활성 장비 목록에 없다"는 결과는
-- 같아 동일하게 soft delete(is_deleted=true) 처리한다 — 대여 이력도 그대로 보존된다.
create or replace function return_external_equipment(
  p_equipment_id uuid,
  p_notes text,
  p_user_email text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_equipment_name text;
  v_ownership_type text;
  v_status text;
  v_supplier_name text;
begin
  select equipment_label(maker, capacity_kva, serial_no), ownership_type, status, supplier_name
    into v_equipment_name, v_ownership_type, v_status, v_supplier_name
    from equipments where id = p_equipment_id for update;
  if v_equipment_name is null then
    raise exception '존재하지 않는 장비입니다: %', p_equipment_id;
  end if;
  if v_ownership_type <> 'EXTERNAL' then
    raise exception '외부 차입 장비만 협력사로 반환할 수 있습니다: %', v_equipment_name;
  end if;
  if v_status <> 'AVAILABLE' then
    raise exception '출고중이거나 점검중인 장비는 협력사로 반환할 수 없습니다. 먼저 반납/점검 완료 처리해 주세요: %', v_equipment_name;
  end if;

  update equipments
    set is_deleted = true,
        deleted_at = now(),
        notes = coalesce(notes || E'\n', '') || '[협력사 반환 완료] ' || coalesce(v_supplier_name, '외부')
          || case when coalesce(btrim(p_notes), '') <> '' then ' - ' || btrim(p_notes) else '' end
    where id = p_equipment_id;

  -- 폐기된 장비와 마찬가지로 더 이상 "핀 고정"해 둘 이유가 없으므로 잔재 데이터를 정리한다.
  delete from user_pins where target_type = 'equipment' and target_id = p_equipment_id::text;

  insert into activity_logs (user_email, action, target_type, target_id, description)
  values (
    p_user_email, 'RETURN', 'EQUIPMENT', p_equipment_id,
    v_equipment_name || ' 협력사(' || coalesce(v_supplier_name, '외부') || ') 반환 처리'
      || case when coalesce(btrim(p_notes), '') <> '' then ' - ' || p_notes else '' end
  );
end;
$$;

-- 5.8-2 장비 완전 삭제 (오입력 대응, 설정 > 삭제된 장비 탭)
-- 대여 전표 이력(rental_order_equipments)이 전혀 없는 폐기 장비에 한해 DB에서
-- 완전히 제거한다. 이력이 하나라도 있으면 회계/이력 무결성을 위해 거부하고
-- 계속 soft delete 상태로만 남긴다.
create or replace function hard_delete_equipment(p_equipment_id uuid, p_user_email text) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_equipment_name text;
  v_is_deleted boolean;
begin
  select equipment_label(maker, capacity_kva, serial_no), is_deleted
    into v_equipment_name, v_is_deleted
    from equipments where id = p_equipment_id for update;
  if v_equipment_name is null then
    raise exception '존재하지 않는 장비입니다: %', p_equipment_id;
  end if;
  if not v_is_deleted then
    raise exception '삭제(폐기) 상태인 장비만 완전 삭제할 수 있습니다: %', v_equipment_name;
  end if;
  if exists (select 1 from rental_order_equipments where equipment_id = p_equipment_id) then
    raise exception '대여 이력이 있는 장비는 완전 삭제할 수 없습니다: %', v_equipment_name;
  end if;

  -- equipments를 FK로 참조하는 종속 데이터를 먼저 정리한다. rental_order_equipments는
  -- 위에서 이미 "이력 없음"을 확인했으니 남아있을 수 없고, maintenance_logs(정비/오일
  -- 교환 이력)와 user_pins(개인 즐겨찾기)는 대여 이력과 무관하게 쌓일 수 있으므로
  -- 여기서 함께 제거해야 FK 위반 없이 DELETE가 성공한다. activity_logs.target_id는
  -- FK가 아닌 순수 참조용 UUID라 정리 대상이 아니다(감사 로그는 영구 보존).
  delete from maintenance_logs where equipment_id = p_equipment_id;
  delete from user_pins where target_type = 'equipment' and target_id = p_equipment_id::text;

  delete from equipments where id = p_equipment_id;

  insert into activity_logs (user_email, action, target_type, target_id, description)
  values (p_user_email, 'DELETE', 'EQUIPMENT', p_equipment_id, v_equipment_name || ' 완전 삭제(DB 제거)');
end;
$$;

-- 5.14 발전기 정보 수정 (SPEC 4-2 상세 모달 [정보 수정]) — 제조사/용량/번호/식별라벨/위치/메모
-- p_serial_no는 대상 장비가 EXTERNAL(외부 차입)이면 생략할 수 있다 — OWNED(자사 보유)
-- 장비는 여전히 필수로 검증한다.
create or replace function update_equipment_info(
  p_equipment_id uuid,
  p_maker text,
  p_capacity_kva int,
  p_current_location text,
  p_notes text,
  p_user_email text,
  p_serial_no int default null,
  p_external_tag text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_name text;
  v_status text;
  v_ownership_type text;
begin
  select equipment_label(maker, capacity_kva, serial_no), status, ownership_type
    into v_old_name, v_status, v_ownership_type
    from equipments where id = p_equipment_id for update;
  if v_old_name is null then
    raise exception '존재하지 않는 장비입니다: %', p_equipment_id;
  end if;
  if coalesce(btrim(p_maker), '') = '' then
    raise exception '제조사를 입력해 주세요';
  end if;
  if p_capacity_kva is null or p_capacity_kva <= 0 then
    raise exception '용량(kVA)을 입력해 주세요';
  end if;
  if v_ownership_type = 'OWNED' and (p_serial_no is null or p_serial_no <= 0) then
    raise exception '번호를 입력해 주세요';
  end if;
  if p_serial_no is not null then
    if p_serial_no <= 0 then
      raise exception '번호를 입력해 주세요';
    end if;
    -- 번호 유일성은 현재 활성(폐기되지 않은) 장비 범위에서만 검사한다.
    if exists (
      select 1 from equipments
      where serial_no = p_serial_no and id <> p_equipment_id and is_deleted = false
    ) then
      raise exception '이미 사용중인 번호입니다: %', p_serial_no;
    end if;
  end if;

  -- 출고중인 장비의 위치는 현장이고, 그 외(대기/점검)는 사내 위치이므로 분류에 반영한다.
  perform touch_location(p_current_location, v_status = 'RENTED');

  update equipments
    set maker = p_maker,
        capacity_kva = p_capacity_kva,
        serial_no = p_serial_no,
        external_tag = nullif(btrim(p_external_tag), ''),
        current_location = coalesce(nullif(btrim(p_current_location), ''), current_location),
        notes = p_notes
    where id = p_equipment_id;

  insert into activity_logs (user_email, action, target_type, target_id, description)
  values (p_user_email, 'UPDATE', 'EQUIPMENT', p_equipment_id, v_old_name || ' 정보 수정');
end;
$$;

-- 5.15 점검/수리 입고: 대기(AVAILABLE) 또는 현장 출고중(RENTED) 장비를 점검/수리중
-- (MAINTENANCE)으로 전환하며 입고 사유를 maintenance_logs에 log_type='START'로 남긴다.
-- 완료 처리는 register_oil_change/complete_equipment_maintenance가 담당한다.
-- 간소화 모델에서는 배차 전표(rental_orders)가 개별 장비 상태를 따로 들지 않으므로
-- (rental_order_equipments는 순수 이력 연결 테이블), 장비를 정비로 빼도 전표 자체는
-- 손대지 않는다 — 전표 반입 완료는 complete_dispatch_return으로 별도 처리한다.
create or replace function start_equipment_maintenance(
  p_equipment_id uuid,
  p_reason text,
  p_user_email text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_equipment_name text;
  v_current_status text;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
begin
  if coalesce(btrim(p_reason), '') = '' then
    raise exception '입고 사유/증상을 입력해 주세요';
  end if;

  select equipment_label(maker, capacity_kva, serial_no), status
    into v_equipment_name, v_current_status
    from equipments where id = p_equipment_id for update;
  if v_equipment_name is null then
    raise exception '존재하지 않는 장비입니다: %', p_equipment_id;
  end if;
  if v_current_status = 'MAINTENANCE' then
    raise exception '이미 점검/수리중인 장비입니다';
  end if;

  update equipments
    set status = 'MAINTENANCE',
        current_location = case when v_current_status = 'RENTED' then '회사' else current_location end
    where id = p_equipment_id;

  insert into maintenance_logs (equipment_id, service_date, service_type, notes, user_email, log_type)
  values (p_equipment_id, v_today, '점검/수리 입고', p_reason, p_user_email, 'START');

  insert into activity_logs (user_email, action, target_type, target_id, description)
  values (p_user_email, 'UPDATE', 'EQUIPMENT', p_equipment_id, v_equipment_name || ' 점검/수리 입고 (' || p_reason || ')');
end;
$$;

-- 5.17 거래처 정보 수정 (SPEC 5-1 설정 > 거래처 관리 [정보 수정] / 비활성화 토글)
create or replace function update_client(
  p_client_id uuid,
  p_name text,
  p_is_active boolean,
  p_user_email text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_name text;
begin
  select name into v_old_name from clients where id = p_client_id for update;
  if v_old_name is null then
    raise exception '존재하지 않는 거래처입니다: %', p_client_id;
  end if;
  if coalesce(btrim(p_name), '') = '' then
    raise exception '거래처명을 입력해 주세요';
  end if;
  if p_name <> v_old_name and exists (select 1 from clients where name = p_name and id <> p_client_id) then
    raise exception '이미 존재하는 거래처명입니다: %', p_name;
  end if;

  update clients set name = p_name, is_active = p_is_active where id = p_client_id;

  insert into activity_logs (user_email, action, target_type, target_id, description)
  values (
    p_user_email, 'UPDATE', 'CLIENT', p_client_id,
    v_old_name || ' 거래처 정보 수정' || (case when not p_is_active then ' (비활성화)' else '' end)
  );
end;
$$;

-- 5.18 신규 거래처 수동 등록 (SPEC 5-1 설정 > 거래처 관리 [+ 새 거래처 등록])
-- 대여 등록 중 자동 학습되는 find_or_create_client와 달리, 이미 존재하는 이름이면 명시적으로 막는다.
create or replace function create_client(
  p_name text,
  p_contact_person text,
  p_phone text,
  p_user_email text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
begin
  if coalesce(btrim(p_name), '') = '' then
    raise exception '거래처명을 입력해 주세요';
  end if;
  if exists (select 1 from clients where name = p_name) then
    raise exception '이미 존재하는 거래처입니다: %', p_name;
  end if;

  insert into clients (name) values (p_name) returning id into v_client_id;

  -- 담당자명은 선택 입력 — find_or_create_client_contact가 빈 값이면 알아서
  -- 아무것도 하지 않고 null을 반환한다(별도 조건 분기 불필요).
  perform find_or_create_client_contact(v_client_id, p_contact_person, p_phone);

  insert into activity_logs (user_email, action, target_type, target_id, description)
  values (p_user_email, 'CREATE', 'CLIENT', v_client_id, '신규 거래처 등록: ' || p_name);

  return v_client_id;
end;
$$;

-- 5.19 보관 장소/현장 정보 수정 (SPEC 5-2 설정 > 현장/보관 장소 관리 [정보 수정] / 숨김 처리)
create or replace function update_location(
  p_location_id uuid,
  p_name text,
  p_is_active boolean,
  p_is_site boolean,
  p_user_email text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_name text;
begin
  select name into v_old_name from locations where id = p_location_id for update;
  if v_old_name is null then
    raise exception '존재하지 않는 장소입니다: %', p_location_id;
  end if;
  if coalesce(btrim(p_name), '') = '' then
    raise exception '장소명을 입력해 주세요';
  end if;
  if p_name <> v_old_name and exists (select 1 from locations where name = p_name and id <> p_location_id) then
    raise exception '이미 존재하는 장소명입니다: %', p_name;
  end if;

  update locations set name = p_name, is_active = p_is_active, is_site = p_is_site where id = p_location_id;

  insert into activity_logs (user_email, action, target_type, target_id, description)
  values (
    p_user_email, 'UPDATE', 'LOCATION', p_location_id,
    v_old_name || ' 장소 정보 수정' || (case when not p_is_active then ' (숨김 처리)' else '' end)
  );
end;
$$;

-- 5.20 신규 장소/현장 수동 등록 (SPEC 5-2 설정 > 현장/보관 장소 관리 [+ 새 장소 등록])
-- 대여 등록/장비 위치 변경 중 자동 학습되는 touch_location과 달리, 이미 존재하는 이름이면 막는다.
create or replace function create_location(p_name text, p_is_site boolean, p_user_email text) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_location_id uuid;
begin
  if coalesce(btrim(p_name), '') = '' then
    raise exception '장소명을 입력해 주세요';
  end if;
  if exists (select 1 from locations where name = p_name) then
    raise exception '이미 존재하는 장소입니다: %', p_name;
  end if;

  insert into locations (name, is_site) values (p_name, p_is_site) returning id into v_location_id;

  insert into activity_logs (user_email, action, target_type, target_id, description)
  values (p_user_email, 'CREATE', 'LOCATION', v_location_id, '신규 장소 등록: ' || p_name);

  return v_location_id;
end;
$$;

-- 5.23 폐기 장비 원상 복구 (SPEC 5-4 설정 > 폐기 장비 복구 [원상 복구]) — 오입력/실수
-- 삭제 대응. 번호 유일성은 활성 장비 범위에서만 강제되므로(equipments_serial_no_active_key)
-- 폐기돼 있는 동안 같은 번호를 가진 새 장비가 등록됐을 수 있다 — 그 경우 복구를
-- 막고 번호를 먼저 조정하도록 안내한다.
create or replace function restore_equipment(p_equipment_id uuid, p_user_email text) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_equipment_name text;
  v_serial_no int;
  v_is_deleted boolean;
begin
  select equipment_label(maker, capacity_kva, serial_no), serial_no, is_deleted
    into v_equipment_name, v_serial_no, v_is_deleted
    from equipments where id = p_equipment_id for update;
  if v_equipment_name is null then
    raise exception '존재하지 않는 장비입니다: %', p_equipment_id;
  end if;
  if not v_is_deleted then
    raise exception '이미 삭제되지 않은 장비입니다: %', v_equipment_name;
  end if;
  if exists (
    select 1 from equipments
    where serial_no = v_serial_no and id <> p_equipment_id and is_deleted = false
  ) then
    raise exception '번호 %번은 현재 다른 활성 장비가 사용 중이라 복구할 수 없습니다. 번호를 먼저 변경해 주세요', v_serial_no;
  end if;

  update equipments set is_deleted = false, deleted_at = null, status = 'AVAILABLE' where id = p_equipment_id;

  insert into activity_logs (user_email, action, target_type, target_id, description)
  values (p_user_email, 'UPDATE', 'EQUIPMENT', p_equipment_id, v_equipment_name || ' 폐기 취소(원상 복구, 대기 상태)');
end;
$$;

-- 5.24 함수 실행 권한 — 로그인한 사용자(authenticated)에게만 실행을 허용한다.
-- anon(비로그인)은 이 RPC들을 포함해 어떤 방식으로도 데이터를 읽거나 바꿀 수 없다.
revoke all on function find_or_create_client(text) from public;
revoke all on function find_or_create_client_contact(uuid, text, text) from public;
revoke all on function touch_location(text, boolean) from public;
revoke all on function equipment_label(text, int, int) from public;
revoke all on function is_admin() from public;
revoke all on function return_external_equipment(uuid, text, text) from public;
revoke all on function register_dispatch(text, text, uuid[], int, int, text, text, date, date, uuid, jsonb) from public;
revoke all on function complete_dispatch_return(uuid, text, date, text) from public;
revoke all on function cancel_dispatch(uuid, text) from public;
revoke all on function set_equipment_location(uuid, text, text) from public;
revoke all on function register_oil_change(uuid, date, int, text, text) from public;
revoke all on function complete_equipment_maintenance(uuid, text, text) from public;
revoke all on function create_equipment(text, int, text, text, text, int, text, text, text) from public;
revoke all on function discard_equipment(uuid, text) from public;
revoke all on function update_equipment_info(uuid, text, int, text, text, text, int, text) from public;
revoke all on function start_equipment_maintenance(uuid, text, text) from public;
revoke all on function update_client(uuid, text, boolean, text) from public;
revoke all on function create_client(text, text, text, text) from public;
revoke all on function update_location(uuid, text, boolean, boolean, text) from public;
revoke all on function create_location(text, boolean, text) from public;
revoke all on function restore_equipment(uuid, text) from public;
revoke all on function hard_delete_equipment(uuid, text) from public;

grant execute on function find_or_create_client(text) to authenticated;
grant execute on function find_or_create_client_contact(uuid, text, text) to authenticated;
grant execute on function touch_location(text, boolean) to authenticated;
grant execute on function equipment_label(text, int, int) to authenticated;
grant execute on function is_admin() to authenticated;
grant execute on function return_external_equipment(uuid, text, text) to authenticated;
grant execute on function register_dispatch(text, text, uuid[], int, int, text, text, date, date, uuid, jsonb) to authenticated;
grant execute on function complete_dispatch_return(uuid, text, date, text) to authenticated;
grant execute on function cancel_dispatch(uuid, text) to authenticated;
grant execute on function set_equipment_location(uuid, text, text) to authenticated;
grant execute on function register_oil_change(uuid, date, int, text, text) to authenticated;
grant execute on function complete_equipment_maintenance(uuid, text, text) to authenticated;
grant execute on function create_equipment(text, int, text, text, text, int, text, text, text) to authenticated;
grant execute on function discard_equipment(uuid, text) to authenticated;
grant execute on function update_equipment_info(uuid, text, int, text, text, text, int, text) to authenticated;
grant execute on function start_equipment_maintenance(uuid, text, text) to authenticated;
grant execute on function update_client(uuid, text, boolean, text) to authenticated;
grant execute on function create_client(text, text, text, text) to authenticated;
grant execute on function update_location(uuid, text, boolean, boolean, text) to authenticated;
grant execute on function create_location(text, boolean, text) to authenticated;
grant execute on function restore_equipment(uuid, text) to authenticated;
grant execute on function hard_delete_equipment(uuid, text) to authenticated;
