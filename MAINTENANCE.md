# MAINTENANCE.md — 유지보수 가이드

> 산업용 장비(발전기) 및 부속품 통합 렌탈·재고 관리 시스템.
> 이 문서는 프로젝트를 처음 인계받는 개발자(사람 또는 AI)가 코드를 열기 전에
> 전체 그림을 파악할 수 있도록 작성되었습니다. **`AGENTS.md`(Next.js 버전 관련
> 주의사항)와 `supabase_schema.sql`(스키마 원본)도 함께 읽으세요.**

---

## 1. 시스템 개요 및 핵심 아키텍처

### 1.1 기술 스택

| 영역 | 기술 | 비고 |
|---|---|---|
| 프레임워크 | Next.js 16.3.3 (App Router) | `--webpack` 고정 (아래 "Windows 개발 환경" 참고) |
| 언어 | TypeScript | strict 모드 |
| DB / BaaS | Supabase (PostgreSQL + RLS + RPC) | `supabase_schema.sql`이 유일한 소스 |
| 스타일 | Tailwind CSS v4 | `src/app/globals.css`에 테마 토큰 정의 |
| UI 컴포넌트 | shadcn/ui (`base-nova` 스타일, `@base-ui/react` 기반) | `src/components/ui/*` |
| 아이콘 | lucide-react | |
| 인증 | Supabase Auth (`@supabase/ssr`) | 이메일/비밀번호 로그인만 사용 |
| 다크모드 | next-themes | `attribute="class"` |
| 상태 관리 | React Context + Server Actions | 별도 상태관리 라이브러리 없음 |

### 1.2 인증 & 라우트 보호

- `src/proxy.ts` — Next.js 16부터 `middleware.ts`가 deprecated되고 `proxy.ts`(export명도
  `proxy`)로 이름이 바뀌었습니다. 동작은 기존 미들웨어와 동일하며, 로그인하지 않은
  요청을 `/login`으로 리다이렉트합니다.
- `src/app/(app)/layout.tsx` — 로그인 이후 화면(`(app)` 라우트 그룹)의 공통 레이아웃.
  여기서 `supabase.auth.getUser()`와 `getUserPins()`를 병렬로 조회해 `Header`,
  `PinsProvider`, `DashboardFilterScope`에 초기값을 내려줍니다.
- RLS는 `authenticated` 롤에만 전체 CRUD를 열어두고(`user_pins`만 소유권 기반 정책),
  `anon` 권한은 테이블 단위로 완전히 회수되어 있습니다. **anon 키가 노출되어도 로그인
  없이는 아무 데이터도 읽거나 쓸 수 없습니다.**

### 1.3 시스템 간소화(1단계) — 대여 중심 단일 모델

**과거(현재는 폐기됨)**: 이 시스템은 한때 발전기(개별 자산)와 일반 장비·부속품
(수량 자산, `bulk_items` 테이블)을 별도로 관리하고, 대여 주문도 RESERVED(예약)
→ ACTIVE(출고) → COMPLETED(반납) 세 단계에 사전 반입/시간 단위 대여/현장 맞교환/
일정 조정 같은 부가 기능이 잔뜩 얹힌 복잡한 모델이었습니다. 실무에서 이런
세부 기능이 거의 쓰이지 않아 복잡도만 키운다는 판단으로 **전면 간소화**했습니다.

**현재 모델 — "대여" 하나로 통일**:

- 날짜 라벨은 **현장 기준**으로 통일합니다 — 발전기가 현장에 들어가는 날(반출/
  `dispatch_date`)을 **현장 반입일**로, 현장에서 빠지는 날(회수/`return_date`)을
  **현장 반출(예정)일**로 부릅니다. (컬럼명/RPC명 자체는 `dispatch`/`return`
  그대로 유지 — 화면 표시 문구만 이렇게 통일했습니다.)
- 용접기(티그/CO2)는 개별 자산 추적을 완전히 걷어내고 `bulk_items` 테이블 자체를
  삭제했습니다. 대신 `rental_orders.tig_count`/`co2_count`라는 단순 수량 컬럼으로만
  남습니다 — "이 대여에 티그 2대, CO2 3대가 같이 나갔다"만 기록하고, 개별 용접기의
  상태/위치/수리 이력은 더 이상 추적하지 않습니다.
- 대여 주문(`rental_orders`)은 **등록하는 순간 이미 확정된 대여**입니다. RESERVED
  (예약 대기) 상태, 사전 반입, 시간 단위 대여, 일정 조정, 현장 맞교환, 거래처 담당자/
  연락처 입력 같은 개념이 전부 사라졌습니다. `status`는 `ACTIVE`(현장에 나가 있음)
  → `COMPLETED`(현장 반출 처리 완료) 둘뿐입니다.
- `dispatch_date`(현장 반입일)/`return_date`(현장 반출 완료일 또는 예정일)는 둘 다
  언제든 자유롭게 수정 가능한 평범한 DATE 컬럼입니다 — "출고 예정일"과 "실제
  출고일"을 구분하던 옛 `start_date`/`actual_delivery_date` 이원화가 사라졌습니다.
- **발전기**는 여전히 개별 자산입니다(어느 발전기가 어느 현장에 나가 있는지, 오일을
  언제 갈았는지 개별 이력 추적). `rental_order_equipments`가 발전기 ↔ 대여 전표를
  연결하지만, 이제는 순수 연결 테이블(id/order_id/equipment_id)일 뿐입니다 — 개별
  장비의 상태·위치는 여전히 `equipments.status`/`current_location`이 담당하고,
  전표 쪽에 따로 상태를 두지 않습니다.
- `serial_no`(번호)는 제조사/용량과 무관하게 발전기 한 대마다 붙는 전역 식별
  번호입니다(예: 1번, 12번, 450번 — "동일 기종 내 몇 번째"를 뜻하는 "호기"가
  아닙니다). 유일성은 **현재 활성(폐기되지 않은) 장비 범위**에서만 강제되며
  (`equipments_serial_no_active_key` 부분 유니크 인덱스, `serial_no is not null`
  조건 포함), 장비를 폐기(소프트 삭제)하면 그 번호는 신규 등록에 다시 쓸 수
  있습니다.
- 자사 보유(`OWNED`) 장비는 `serial_no`가 여전히 필수지만, 외부 차입(`EXTERNAL`)
  장비는 우리 번호 체계에 편입돼 있지 않은 경우가 많아 `serial_no`를 NULL로 두고
  대신 `external_tag`(자유 식별 라벨, 예: '동양 1호')로 화면에 구분 표시합니다.
  화면 표시(`formatGeneratorLabel`)와 로그/예외 메시지(SQL `equipment_label`
  함수)는 번호 유무에 따라 자동으로 포맷을 전환합니다.
- **팀(`teams`)과 사용자 프로필(`user_profiles`)**이 새로 생겼습니다. 대여 전표는
  `team_id`로 어느 팀이 등록했는지 남기고(미배정 가능), `user_profiles`는
  `auth.users` 각 계정에 소속 팀과 권한(`role`: ADMIN/MEMBER)을 붙입니다.
  신규 가입 시 `handle_new_user()` 트리거가 자동으로 `user_profiles` 행을
  만들며(team_id는 미배정, role은 기본 MEMBER), 관리자가 이후 팀 배정/승격을
  처리합니다. ADMIN은 팀과 무관하게 전체 데이터를 열람/관리할 수 있는 총괄
  권한을 의도합니다(`is_admin()` SECURITY DEFINER 헬퍼로 RLS에서 판별) — 다만
  현재는 `rental_orders` 등 나머지 테이블 RLS는 아직 기존처럼 `authenticated`
  전체 접근이며, 팀 단위 접근 제한 자체는 이번 1단계 범위 밖입니다(추후 단계에서
  다룰 예정).
- 과거에는 `item_categories`/`category_groups`라는 별도 카테고리 마스터 테이블과
  "설정 > 카테고리 관리" 화면이 있었지만, 그보다 앞선 개편에서 이미 완전히
  제거되었습니다(현재도 없습니다).

---

## 2. 데이터베이스 구조 및 주요 RPC 목록

### 2.1 원칙: `supabase_schema.sql`이 유일한 진실

**이 프로젝트는 별도 마이그레이션 파일을 쓰지 않습니다.** `supabase_schema.sql`
하나가 테이블/인덱스/RLS/RPC/초기 시드 데이터를 전부 포함하며, 스키마를 바꿀
때는 이 파일을 직접 수정합니다. 자세한 절차는 5장을 참고하세요.

파일 구성 순서:
1. Dev reset(`drop table ... cascade`) — 처음부터 다시 만들 때만 씀
2. 테이블 정의
3. 인덱스
4. `is_admin()` 헬퍼 + RLS(Row Level Security) 정책 + `handle_new_user()` 가입 트리거
5. 초기 테스트 데이터 (거래처 4곳/현장/팀 3개/발전기 18대(자사 15대 + 외부 차입 3대)/
   대여 전표 8건 — 가동중 5건 + 완료 3건 — 전 라이프사이클 예시)
6. RPC 함수 (전체 mutation 로직)
7. 함수 실행 권한(grant/revoke) — `authenticated`에게만 실행 허용

### 2.2 주요 테이블

| 테이블 | 역할 |
|---|---|
| `clients` / `client_contacts` | 거래처 마스터 + 담당자(1거래처 : N담당자). 대여 등록 시 이름 입력만으로 자동 학습(upsert)됨 |
| `locations` | 보관 위치/현장 마스터. `is_site`로 사내 위치(false)와 외부 현장(true) 구분. 이것도 자동 학습됨 |
| `equipments` | **발전기 전용.** `maker`, `capacity_kva`, `serial_no`(전역 관리번호, "N번" — OWNED는 필수, EXTERNAL은 NULL 허용), `external_tag`(번호 없는 외부 차입 장비의 자유 식별 라벨), `status`, `current_location`, `last_oil_change_date/hours`, `notes`, `is_deleted`(소프트 삭제), `deleted_at`(폐기 시각), `ownership_type`('OWNED'\|'EXTERNAL', 외부 차입/전대 장비 구분), `supplier_name`/`supplier_contact`(EXTERNAL일 때만) |
| `teams` | 팀 마스터(`name`). 대여 전표가 `team_id`로 참조 |
| `user_profiles` | `auth.users` 1:1 확장 — `email`, `team_id`(미배정 가능), `role`('ADMIN'\|'MEMBER'). `handle_new_user()` 트리거로 가입 시 자동 생성 |
| `rental_orders` | **대여 전표.** `status`: ACTIVE(현장 가동중) → COMPLETED(현장 반출 완료) 둘뿐. `team_id`(대여를 등록한 팀), `dispatch_date`(현장 반입일)/`return_date`(현장 반출 완료·예정일, 둘 다 자유롭게 수정 가능), `tig_count`/`co2_count`(투입 용접기 수량) |
| `rental_order_equipments` | 전표 ↔ 발전기(1:N) **순수 연결 테이블**(id/order_id/equipment_id만). 장비 상태·위치는 `equipments` 쪽이 담당 |
| `maintenance_logs` | 발전기 정비 이력. `log_type`: START(입고)/COMPLETE(완료 — 오일교환 등록 또는 단순 점검완료) |
| `activity_logs` | 전체 작업 감사 로그(설정 > 작업 감사 로그 화면에서 조회) |
| `user_pins` | 계정별 즐겨찾기(핀). `target_type`: 'site' \| 'equipment'. **`auth.uid()` 소유권 기반 RLS를 쓰는 테이블 중 하나**(`user_profiles`도 마찬가지, 아래 참고) |

### 2.3 핵심 RPC 함수 (총 23개, 전부 `security definer`)

모든 mutation은 반드시 이 RPC들을 통해서만 이뤄집니다 — 프론트가 테이블에
직접 INSERT/UPDATE하지 않습니다. 아래는 실무에서 자주 마주치는 핵심 함수만
정리했습니다(전체 목록은 `supabase_schema.sql`의 `5.1`~`5.24` 주석 참고).

| RPC 함수 | 역할 | 호출하는 Server Action |
|---|---|---|
| `register_dispatch` | 대여 등록 — 투입현장/발주업체/현장 반입일(기본 오늘)/현장 반출 예정일(선택)/발전기 ID 배열/티그·CO2 수량을 받아 즉시 확정(ACTIVE)한다(거래처 담당자/연락처는 더 이상 화면에서 입력받지 않는다). 선택된 발전기는 곧바로 `status='RENTED'`/`current_location=현장명`으로 갱신 — 이미 다른 현장에 RENTED 중이던 발전기도 예외 없이 새 현장으로 인계(현장 직송) 가능. 발전기 0대+용접기 0개면 예외. `p_team_id`를 명시적으로 넘기지 않으면(화면에 팀 선택 UI가 없다) 지금 로그인한 계정(`auth.uid()`) 본인의 소속 팀으로 자동 배정된다 | `registerDispatch` (`rentals.ts`) |
| `complete_dispatch_return` | 현장 반출 처리 — 전표 ID/실제 현장 반출일(기본 오늘, 소급 가능)/입고 장소(기본 '회사')를 받아 전표를 COMPLETED로, 딸린 발전기 전부를 AVAILABLE + 입고 장소로 일괄 복귀 | `completeDispatchReturn` |
| `cancel_dispatch` | **대여 취소(오입력 대응)** — ACTIVE 상태 전표만 취소 가능. 배정됐던 발전기 전부를 즉시 사내(회사)로 복귀시킨 뒤, 전표(`rental_orders`)와 연결 데이터(`rental_order_equipments`)를 완전히 삭제한다(간소화 모델엔 CANCELLED 상태가 없어 "취소"는 곧 삭제). `activity_logs`엔 취소 로그가 남는다 | `cancelDispatch` |
| `start_equipment_maintenance` | 발전기를 점검/수리 입고(MAINTENANCE) 처리. 대여 전표 자체는 건드리지 않는다(전표 완료는 `complete_dispatch_return`으로 별도 처리) | `startEquipmentMaintenance` |
| `register_oil_change` | 오일/필터 교환 등록. MAINTENANCE였다면 AVAILABLE로 자동 복귀 | `registerOilChange` |
| `complete_equipment_maintenance` | 오일교환 없이 점검만 완료하고 AVAILABLE로 복귀(둘은 서로 다른 액션) | `completeEquipmentMaintenance` |
| `create_equipment` / `update_equipment_info` | 발전기 신규 등록 / 정보 수정(제조사·용량·번호·식별라벨·위치·메모). 번호는 활성 장비 범위에서만 유일성 검사하며, OWNED는 필수·EXTERNAL은 생략 가능(대신 `p_external_tag`). `create_equipment`는 외부 차입 장비 등록 시 `p_ownership_type='EXTERNAL'`이면 `p_supplier_name` 필수 | `createEquipment` / `updateEquipmentInfo` |
| `discard_equipment` | 발전기 폐기(소프트 삭제, `deleted_at` 기록) | `discardEquipment` |
| `return_external_equipment` | 외부 차입(EXTERNAL) 장비를 협력사로 반환 처리(소프트 삭제 — AVAILABLE 상태에서만 허용) | `returnExternalEquipment` |
| `restore_equipment` | 폐기된 발전기를 대기(AVAILABLE) 상태로 원상 복구. 폐기돼 있는 동안 같은 번호를 다른 활성 장비가 선점했다면 거부 | `restoreEquipment` |
| `hard_delete_equipment` | 폐기된 발전기를 DB에서 완전 삭제. **대여 이력(`rental_order_equipments`)이 전혀 없는 경우에만** 허용 — 오입력 등록 대응용. 종속된 `maintenance_logs`/`user_pins`는 삭제 전 함께 정리(FK 위반 방지); `activity_logs`는 FK가 아니라 그대로 보존 | `hardDeleteEquipment` |
| `set_equipment_location` | 발전기 보관 위치 수동 변경 | `setEquipmentLocation` |
| `is_admin()` | `user_profiles` RLS 정책 및 향후 권한 체크에서 재사용하는 SECURITY DEFINER 헬퍼 — 호출한 계정이 ADMIN인지 boolean으로 반환 | (직접 호출 안 됨, RLS 내부 헬퍼) |
| `find_or_create_client` / `touch_location` / `equipment_label` | 거래처명/장소명 자동 학습(upsert), 발전기 표시 라벨 포맷 — 여러 RPC 내부에서 `perform`/`select`로 호출됨 | (직접 호출 안 됨, 내부 헬퍼) |

**참고**: 예전에 있던 `create_rental_order`/`dispatch_rental_order`/
`process_rental_return`/`process_site_return`/`revert_rental_dispatch`/
`pre_dispatch_rental_order`/`delete_rental_order`/`swap_dispatched_equipment`/
`adjust_rental_schedule_with_swap`(예약·출고확정·부분반납·현장일괄반납·롤백·
사전반입·전표삭제·맞교환·일정조정)와 `create_bulk_item`/`record_bulk_stock_change`/
`adjust_bulk_stock_count`/`convert_bulk_stock`/`send_bulk_item_to_repair`/
`complete_bulk_item_repair`(수량 자산 CRUD/재고변동/수리)는 시스템 간소화
1단계에서 **전부 제거**되었습니다 — 위 표에 없으면 더 이상 존재하지 않습니다.

**주의**: 파일 상단의 `do $$ ... $$` 블록이 이름 기준으로 함수를 먼저
`drop`한 뒤 다시 만듭니다. 새 RPC를 추가하면 **반드시 이 drop 목록에도
이름을 추가**해야 하며(안 그러면 시그니처를 바꿀 때 옛 오버로드가 남아
PostgREST가 "어떤 함수인지 특정할 수 없음" 에러를 냅니다), 파일 맨 아래
`revoke`/`grant` 두 블록에도 시그니처를 정확히 맞춰 추가해야 합니다.

### 2.4 Supabase 클라이언트 타입 추론 버그 우회 (반드시 알아야 함)

`@supabase/supabase-js@^2.112.4`에는 제네릭 타입 추론이 깨져 `select()`/`rpc()`
결과가 `never`로 추론되는 버그가 있습니다. 이 프로젝트는 아래 두 헬퍼로 우회합니다:

- `src/lib/supabase/rpc.ts`의 `callRpc<T>()` — 모든 RPC 호출은 이 함수를 통해서만.
- `.select()` 체인에는 항상 `.returns<T[]>()`를 붙입니다.
- `src/lib/supabase/insert-rows.ts`의 `insertRows()` — `.insert()`에 대한 동일한 우회.

새 쿼리를 작성할 때 이 패턴을 빼먹으면 타입은 통과하지만 런타임에 예기치
않은 `any`/`never` 문제가 생길 수 있으니 항상 위 헬퍼를 재사용하세요.

---

## 3. 디렉토리 구조 및 주요 컴포넌트 맵

```
supabase_schema.sql          ← DB 스키마 전체(유일한 소스, 마이그레이션 파일 없음)
src/
├─ proxy.ts                  ← 인증 가드 (구 middleware.ts)
├─ app/
│  ├─ layout.tsx              루트 레이아웃 — ThemeProvider, TextSizeProvider, 폰트
│  ├─ manifest.ts              PWA 매니페스트
│  ├─ (app)/                   로그인 후 화면 그룹
│  │  ├─ layout.tsx             Header/PinsProvider/DashboardFilterScope 공통 배치
│  │  ├─ page.tsx                대시보드
│  │  ├─ equipments/page.tsx     발전기 관리
│  │  └─ settings/page.tsx       설정
│  ├─ login/page.tsx           로그인 화면
│  ├─ actions/                 Server Actions (아래 3.1)
│  └─ api/export/*/route.ts    CSV/JSON 백업 다운로드 API
└─ components/
   ├─ dashboard/               대시보드 전용 위젯 (아래 3.2)
   ├─ equipments/               발전기 관리 화면
   ├─ rentals/                  대여 등록/현장 반출 처리 모달 (아래 3.3)
   ├─ settings/                 설정 화면 탭들
   ├─ shared/                   전역 공용(핀, 테마, 글자크기, 콤보박스 등, 아래 4장)
   ├─ layout/                   GNB / 모바일 하단 탭바
   ├─ auth/                     로그인 폼, 로그아웃, 로그인 이메일 컨텍스트
   └─ ui/                       shadcn/ui 원본 프리미티브 (직접 수정 지양)
```

### 3.1 `src/app/actions/` — Server Action 역할

| 파일 | 내용 |
|---|---|
| `auth.ts` | 로그인(`loginAction`)/로그아웃(`logout`) |
| `rentals.ts` | 대여 등록(`registerDispatch`)/현장 반출 처리(`completeDispatchReturn`)/대여 취소(`cancelDispatch`) |
| `equipment.ts` | 발전기 CRUD + 위치변경 + 정비(입고/오일교환/점검완료)/폐기 + 외부 차입 협력사 반환 |
| `pins.ts` | 즐겨찾기 조회(`getUserPins`)/토글/일괄저장 |
| `settings.ts` | 거래처·장소 수동 등록/수정, 폐기 장비 복구 |

모든 액션은 `ActionResult`(`src/lib/action-result.ts`) 형태(`{ success, error? }`
또는 `{ success, data? }`)로 반환하고, 성공 시 관련 경로를 `revalidatePath()`합니다.

### 3.2 대시보드 핵심 컴포넌트 (`src/components/dashboard/`)

| 컴포넌트 | 역할 |
|---|---|
| `dashboard-kpi-cards.tsx` | 상단 KPI 3장: 오늘 현장 반입 / 오늘 현장 반출 예정 / 가동중인 현장(전표 건수가 아니라 **고유 현장 수**) |
| `category-location-matrix.tsx` | 발전기 보유 현황 — 용량별 클릭-확장 서랍(accordion)으로 드릴다운 |
| `rental-orders-panel.tsx` | "대여 현황" 패널 — 현장 → 거래처 → 전표 3단 계층, 검색, 가동중/완료 탭, 장비 뱃지 클릭 시 상세 모달, 각 전표에 `[대여 취소]`(오입력 대응, `cancel_dispatch`)/`[현장 반출 처리]` 액션, `selectedTeamId`로 팀 필터링(4.4 참고) |
| `dashboard-month-calendar.tsx` / `month-calendar.tsx` | 월별 현장 반입/반출 일정 캘린더(전체 너비). `dashboard-month-calendar.tsx`가 핀 필터와 함께 `selectedTeamId`로도 걸러준다 |
| `dashboard-filter-scope.tsx` / `dashboard-filter-toggle.tsx` | "전체 보기" / "📌 내 관심만 보기" 필터 — `localStorage`에 계정별로 저장(4.1 참고) |
| `favorite-manage-button.tsx` | 관심 현장/장비 일괄 설정 모달 진입 버튼 |

### 3.3 모달 컴포넌트 (`src/components/rentals/`)

`new-rental-dialog.tsx`(대여 등록 — 투입현장/발주업체/현장 반입일/현장 반출 예정일/
메모 + **발전기 번호 역조회 배정**(번호를 입력하면 `serial_no`로 즉시 찾아 배정
목록에 추가, 이미 다른 현장에 RENTED 중이면 "현재 OO현장 가동중 · 직송 대여" 경고
뱃지만 붙이고 그대로 허용) + 티그/CO2 용접기 수량 증감 카운터, `register_dispatch`
호출 — 거래처 담당자/연락처 입력란은 없으며(RPC에는 항상 빈 값 전달), 팀도 화면에
선택 UI가 없고 RPC가 로그인 계정 소속 팀으로 자동 배정한다),
`return-order-dialog.tsx`(현장 반출 처리 — 실제 현장 반출일/입고 장소,
`complete_dispatch_return` 호출). 대여 취소(`cancel_dispatch`)는 별도 모달 없이
`rental-orders-panel.tsx`의 `[대여 취소]` 버튼 + `AlertDialog`로 바로 처리한다.
예전에 있던 출고확정/현장일괄반납/일정조정/맞교환/사전반입 모달은 대응하는 RPC와
함께 전부 제거되었습니다.

### 3.4 GNB / 네비게이션

- `src/lib/nav-items.ts` — 데스크톱 GNB(`layout/gnb-nav.tsx`)와 모바일 하단
  탭바(`layout/mobile-bottom-nav.tsx`)가 **공유하는 단일 소스**. 메뉴를 추가/변경할
  땐 이 파일 하나만 고치면 양쪽에 반영됩니다. 현재 메뉴: 대시보드 / 발전기 관리
  / 설정.

---

## 4. 글로벌 상태 및 테마/설정

### 4.1 `PinsProvider` — DB 기반 즐겨찾기 동기화 (`src/components/shared/pins-provider.tsx`)

- `localStorage`가 아니라 **`user_pins` 테이블**에 저장합니다 — 로그인 계정만
  같으면 PC/모바일 등 어느 기기에서 봐도 동일한 핀 상태를 봅니다.
- 초기값은 `(app)/layout.tsx`가 서버에서 미리 `getUserPins()`로 조회해 내려주므로
  SSR과 클라이언트 첫 렌더가 항상 일치합니다(하이드레이션 불일치 없음).
- 이후 토글/일괄저장은 **낙관적 업데이트**: 로컬 상태를 먼저 바꾸고 서버 액션을
  호출하며, 실패하면 되돌립니다.
- 참고로 대시보드의 "전체보기/내 관심만 보기" **모드 자체**(어떤 핀을 보여줄지가
  아니라 지금 어느 모드인지)는 DB가 아니라 `localStorage`에 계정별 키
  (`dashboard_filter_mode_${email}`)로 저장됩니다 — 여러 계정이 같은 브라우저를
  쓰는 사내 공용 PC 환경을 고려한 설계입니다(`dashboard-filter-scope.tsx`).

### 4.2 `TextSizeProvider` — 루트 폰트 스케일링 (`src/components/shared/text-size-provider.tsx`)

- 3단계 순환: 보통(100%) → 크게(112%) → 아주 크게(125%).
- **원리**: `document.documentElement.style.fontSize`를 퍼센트로 직접 조작합니다.
  Tailwind v4 유틸리티 대부분이 `rem` 단위라서, 루트 폰트 크기 하나만 바꾸면
  간격·폰트가 전부 비례해서 함께 커져 레이아웃이 깨지지 않습니다.
- `localStorage`(`text-size-level`)에 저장하고, `useSyncExternalStore`로
  구독합니다 — `useEffect`+`setState`로 값을 복원하는 일반적인 패턴을 쓰지 않은
  이유는 이 프로젝트의 ESLint 설정이 `react-hooks/set-state-in-effect` 규칙으로
  그 패턴을 금지하기 때문입니다(캐스케이딩 렌더 방지). 같은 이유로 다크모드
  토글의 "mounted" 체크도 `src/lib/use-is-client.ts`의 `useIsClient()`
  (`useSyncExternalStore` 기반)를 씁니다.
- `src/app/layout.tsx`에 있는 인라인 `<script>`가 hydration 이전에 동일한 값을
  먼저 적용해 새로고침 시 깜빡임(FOUC)을 막습니다.
- 헤더의 `[가A]` 버튼(`text-size-toggle.tsx`)이 유일한 조작 UI입니다. (예전에
  설정 페이지에도 세그먼트 컨트롤이 있었지만, 헤더 버튼과 기능이 중복된다는
  피드백으로 제거되었습니다 — 컨텍스트/로직 자체는 그대로 남아 있으니 필요하면
  같은 `useTextSize()` 훅으로 다른 화면에도 쉽게 다시 노출할 수 있습니다.)

### 4.3 다크모드 (`next-themes`)

- `src/components/shared/theme-provider.tsx` — `next-themes`의 `ThemeProvider`를
  `attribute="class"`, `defaultTheme="system"`, `enableSystem`으로 감싼 얇은 래퍼.
  `src/app/layout.tsx`에서 최상위에 적용됩니다(`<html suppressHydrationWarning>`
  필수 — next-themes 공식 요구사항).
- `theme-toggle.tsx` — 헤더의 ☀️/🌙 원클릭 토글.
- **스타일링 원칙**: shadcn/ui 프리미티브(Card/Dialog/Button 등)는 전부
  `src/app/globals.css`의 CSS 변수(`--background`, `--card`, `--border` 등)를
  쓰고 있어 `.dark` 클래스가 붙으면 자동으로 전환됩니다. 커스텀 색상(상태 뱃지 등)을
  추가할 때는 **반드시** `bg-emerald-100 text-emerald-800 dark:bg-emerald-950
  dark:text-emerald-300`처럼 라이트/다크 쌍을 함께 지정하세요 — 이 프로젝트
  전역에서 지켜지고 있는 컨벤션입니다.

### 4.4 `TeamFilterScope` — 팀별 조회 필터 (`src/components/shared/team-filter-scope.tsx`)

- `(app)/layout.tsx`가 서버에서 로그인 계정의 `user_profiles`(role/team_id)와
  전체 `teams` 목록을 미리 조회해 `TeamFilterScope`에 내려줍니다. 이 스코프는
  `Header`(팀 선택기가 필요)와 대시보드 콘텐츠를 **모두** 감싸야 하므로, 컴포넌트
  트리에서 `PinsProvider`/`DashboardFilterScope`보다 바깥(레이아웃) 레벨에 있습니다.
- **ADMIN**: `TeamSelector`(헤더 우측)에서 전체/특정 팀을 자유롭게 골라볼 수 있고,
  선택값은 `PinsProvider`와 마찬가지로 계정별 `localStorage` 키
  (`dashboard_team_filter_${email}`)에 저장됩니다.
- **MEMBER**: 선택기 대신 본인 소속 팀명을 읽기 전용 뱃지로만 보여주며,
  `selectedTeamId`는 항상 `user_profiles.team_id`로 고정됩니다(로컬 저장값이
  있어도 무시) — 다른 팀 데이터를 실수로/의도적으로 들여다볼 수 없습니다.
- `useTeamFilter()`가 반환하는 `selectedTeamId`(팀 UUID 또는 `ALL_TEAMS`)를
  `rental-orders-panel.tsx`와 `dashboard-month-calendar.tsx`가 각각 구독해
  `team_id` 일치 여부로 클라이언트 필터링합니다 — "내 관심만 보기"(4.1)와 동일하게
  **서버는 전체 데이터를 이미 다 내려주고, 화면에서만 걸러 보여주는 방식**입니다
  (팀별 RLS 접근 제한 자체는 아직 없습니다 — MAINTENANCE.md 1.3절 참고).
- 신규 가입 시 `user_profiles` 행이 자동 생성되지만 `team_id`는 NULL(미배정)로
  시작합니다 — 관리자가 5.2절 절차로 팀을 배정해야 그 계정이 MEMBER 뷰에서
  팀명 뱃지를 보게 됩니다.

---

## 5. 실무 유지보수 가이드 (How-to)

### 5.1 새 발전기 규격/번호를 추가할 때

발전기는 카테고리 마스터가 없는 자유 입력 구조입니다. 코드 수정 없이 화면에서
바로 처리됩니다:

1. `/equipments` → **[+ 새 장비 등록]** → 제조사(`maker`)/용량(`capacity_kva`)/
   번호(`serial_no`)/보관 위치 입력 → 등록.
   - `serial_no`는 제조사·용량과 무관하게 전체 발전기가 공유하는 전역 번호입니다
     (동일 기종 내 순번이 아닙니다). `create_equipment` RPC가 **현재 활성 장비**
     범위에서 중복을 검사하므로, 폐기(소프트 삭제)된 장비가 쓰던 번호는 재사용할
     수 있습니다.
   - 제조사 입력창은 `TextCombobox`로, 기존 값 자동완성 + 신규 값 자유 입력을
     동시에 지원합니다. **완전히 새로운 제조사명**을 프리셋에 미리 넣고 싶다면
     `new-equipment-dialog.tsx`/`edit-equipment-dialog.tsx`의 `MAKER_OPTIONS`
     배열(두 파일에 동일하게 존재)에 추가하세요 — 필수는 아니고, 자동완성
     후보를 미리 보여주는 편의 기능일 뿐입니다.
2. `create_equipment` RPC가 `equipments` 테이블에 행을 하나 추가하고
   `activity_logs`에 기록을 남깁니다. **DB 스키마 변경이 필요 없습니다.**
3. 대여 등록 모달에서 새 발전기는 자동으로 해당 제조사 탭/용량 그룹에 나타나며,
   핀(즐겨찾기) 설정 전까지는 번호 오름차순으로 정렬됩니다.
4. 오입력으로 잘못 등록했거나 실수로 폐기했다면 `/settings` → **삭제된 장비**
   탭에서 대응합니다: **[복구]**는 `restore_equipment`로 대기(AVAILABLE)
   상태로 되돌리고(단, 폐기돼 있는 동안 같은 번호를 다른 활성 장비가 쓰기
   시작했다면 거부됩니다), **[영구 삭제]**는 `hard_delete_equipment`로 DB에서
   완전히 제거합니다 — 이 버튼은 그 장비에 대여 이력(`rental_order_equipments`)이
   **하나도 없을 때만** 노출/허용됩니다(회계·이력 무결성 보호).

### 5.2 새 팀을 추가하거나 사용자 권한을 바꿀 때

전용 관리 화면이 아직 없으므로(1단계 범위 밖) Supabase Dashboard의 Table
Editor 또는 SQL Editor에서 직접 처리합니다:

1. **새 팀 추가**: `teams` 테이블에 `insert into teams (name) values ('3팀');`
   처럼 행을 추가하면, 헤더의 팀 선택기(ADMIN 전용, 4.4 참고)에 즉시 나타납니다
   (코드 수정 불필요). 대여 등록 모달에는 팀 선택 UI가 없다 — `register_dispatch`가
   로그인 계정의 소속 팀으로 자동 배정한다.
2. **사용자 팀 배정/승격**: 계정이 최소 한 번 로그인해 `handle_new_user()`
   트리거로 `user_profiles` 행이 생성된 뒤, `update user_profiles set
   team_id = '<팀 UUID>', role = 'ADMIN' where email = '<계정 이메일>';`로
   직접 수정합니다. RLS상 일반 사용자는 자기 프로필을 직접 고칠 수 없고
   (SELECT만 가능) ADMIN만 전체 프로필을 수정할 수 있으므로, 아직 ADMIN이
   한 명도 없는 초기 세팅 단계에서는 Supabase Dashboard(서비스 롤 권한)로
   첫 ADMIN을 지정해야 합니다.

### 5.3 DB 스키마를 수정할 때 (중요 — 반드시 지킬 것)

이 프로젝트는 **별도 마이그레이션 시스템이 없습니다.** `supabase_schema.sql`
전체를 Supabase SQL Editor에 다시 붙여넣고 실행하는 방식이며, 파일 최상단의
"Dev reset" 블록이 관련 테이블을 `drop ... cascade`한 뒤 처음부터 다시
만듭니다. 이는 **이미 운영 데이터가 있는 환경에서는 절대 그대로 실행하면
안 됩니다** — 전체 데이터가 삭제됩니다.

원칙:

1. **테이블/컬럼을 바꿀 땐 `supabase_schema.sql`을 직접 편집**하세요. 이
   파일과 실제 DB 상태가 어긋나면 다음 사람이 신뢰할 수 있는 소스를 잃습니다.
2. **RPC 함수를 추가/변경할 땐 3곳을 함께 고쳐야 합니다**:
   - 함수 본문(`create or replace function ...`)
   - 파일 상단 `do $$ ... $$` 블록의 `proname in (...)` 목록(새 함수명 추가,
     삭제된 함수는 제거)
   - 파일 하단 `revoke`/`grant` 두 블록(파라미터 시그니처까지 정확히 일치)
   - 세 곳이 어긋나면 `next build`/`lint`는 통과해도 **런타임에만** 터지므로
     특히 주의하세요(TypeScript가 SQL을 검증해주지 않습니다).
3. **TypeScript 타입도 함께 갱신**하세요: `src/lib/supabase/types.ts`는
   `supabase gen types`를 쓰지 않고 손으로 스키마와 1:1 대응하도록 관리합니다.
   테이블/컬럼을 바꾸면 이 파일의 해당 `interface`도 반드시 같이 고치세요.
4. **점진적 마이그레이션이 필요한 운영 환경이라면**(이 프로젝트가 아직
   사내 배포 전이라 지금은 자유롭게 초기화 가능하지만, 배포 이후에는):
   - `create table`을 `drop cascade` 없이 `alter table ... add column`으로
     바꾸고, 기존 행에 대한 기본값/백필을 별도로 처리해야 합니다.
   - RPC는 `create or replace function`이 기존 함수를 안전하게 덮어쓰므로
     대부분 그대로 재사용 가능하지만, **파라미터 목록을 바꾸면 새 오버로드로
     추가될 뿐 이전 버전이 지워지지 않습니다** — 반드시 위 2번의 drop 블록으로
     옛 시그니처를 먼저 지우세요.
   - CHECK 제약(예: `rental_orders_status_check`)을 바꿀 때는 기존 행이
     새 제약을 통과하는지 먼저 확인하세요.
5. 스키마를 바꿨다면 관련 UI도 함께 확인하세요 — 특히 `EquipmentRow`/
   `RentalOrderRow`를 쓰는 컴포넌트(`equipment-card.tsx`,
   `equipment-detail-dialog.tsx`, `new-rental-dialog.tsx`,
   `rental-orders-panel.tsx` 등 다수)는 타입이 안 맞으면 `npm run build`에서
   즉시 잡힙니다. 다만 Supabase JS의 `.select("col1, col2, ...")` 문자열은
   TypeScript가 컬럼명을 검증해주지 않으므로(런타임에만 실패), 컬럼명을 바꿀
   땐 `grep`으로 옛 컬럼명이 select 문자열에 남아있지 않은지 직접 확인하세요.

### 5.4 검증 절차 (모든 변경 공통)

```bash
rm -rf .next && npm run build   # next build --webpack — 타입/빌드 오류 확인
npm run lint                     # ESLint (unused-vars, hooks 규칙 등)
```

- **Windows 개발 환경 주의**: `dev`/`build` 스크립트가 `--webpack`으로
  고정되어 있습니다(Turbopack에 알려진 네이티브 버그가 있어 우회). 절대
  `next dev`/`next build`를 플래그 없이 직접 실행하지 마세요.
- 로그인이 필요한 화면은 이 저장소 환경에서 브라우저로 직접 클릭 테스트를
  할 수 없습니다 — `curl`로 `/login`(200)과 보호된 라우트(307 리다이렉트)
  응답 코드만 확인 가능합니다. **실제 화면 동작(모달 흐름, 폼 검증 등)은
  사람이 브라우저에서 직접 확인해야 합니다.**
- 개발 서버(`npm run dev`)가 이미 3000번 포트에서 떠 있다면 새로 띄우지 말고
  재사용하세요. 직접 띄웠다면 정확한 PID를 확인한 뒤에만 종료하세요.

### 5.5 환경 변수

`.env.local`에 아래 두 값이 필요합니다(`.env.example` 참고):

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

둘 다 `NEXT_PUBLIC_` 접두사로 브라우저에 노출되는 값이며, `service_role` 키는
이 프로젝트 어디에서도 쓰지 않습니다(anon 키 + RLS로만 접근 제어).
